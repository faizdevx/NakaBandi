import asyncio
import hmac
import json
import logging
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import ai, analysis, geo, geocode
from .cache import Cache, utcnow
from .config import settings
from .history import History
from .http import UpstreamError
from .probes import PROBE_RADIUS_DEG, PROBES
from .providers import build_provider
from .schemas import BBox


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps(
            {
                "ts": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
            }
        )


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
# httpx logs full URLs at INFO, and provider keys travel in the query string.
logging.getLogger("httpx").setLevel(logging.WARNING)

CELL = 0.5
MAX_CELLS = 16
SEGMENT_TTL = 3600
REPORT_TTL = 3600
AI_SETTING_KEY = "settings:ai"
MAX_CLICK_KM = 0.25
NAMED_IN_REPORT = 5


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(timeout=20)
    app.state.cache = Cache(settings.redis_url)
    app.state.history = History()
    app.state.provider = build_provider(app.state.client)
    await app.state.history.connect(settings.database_url)
    yield
    await app.state.history.close()
    await app.state.client.aclose()


app = FastAPI(title="Nakabandi API", lifespan=lifespan)


@app.exception_handler(UpstreamError)
async def upstream_error(_: Request, exc: UpstreamError):
    code = 429 if exc.kind == "rate_limited" else 502
    return JSONResponse(status_code=code, content={"detail": {"code": f"{exc.service}_{exc.kind}", "detail": str(exc)}})


def need_provider(request: Request):
    provider = request.app.state.provider
    if provider is None:
        raise HTTPException(
            503, {"code": "provider_not_configured", "detail": "No traffic provider key is set (HERE_API_KEY)."}
        )
    return provider


def parse_bbox(bbox: str = Query(..., description="west,south,east,north")) -> BBox:
    try:
        w, s, e, n = map(float, bbox.split(","))
    except ValueError:
        raise HTTPException(422, {"code": "bad_bbox", "detail": "Expected west,south,east,north."}) from None
    box = BBox(west=w, south=s, east=e, north=n)
    if not geo.valid_india_bbox(box):
        raise HTTPException(422, {"code": "bad_bbox", "detail": "Bounding box must lie inside the India region."})
    return box


def provider_meta(provider) -> dict:
    return {"name": provider.name, "attribution": provider.attribution, "capabilities": provider.capabilities}


async def fetch_flow(request: Request, provider, box: BBox, fc: int, key: str, ttl: int) -> tuple[dict, bool]:
    state = request.app.state

    async def load():
        batch = (await provider.flow(box, fc)).model_dump(mode="json")
        await state.cache.set_many({f"seg:{r['segment']['id']}": r for r in batch["records"]}, SEGMENT_TTL)
        await state.history.record(batch["records"])
        return batch

    return await state.cache.fetch(f"flow:{provider.name}:{key}", ttl, load)


async def fetch_incidents(request: Request, provider, box: BBox, key: str) -> tuple[list, bool]:
    async def load():
        return [i.model_dump(mode="json") for i in await provider.incidents(box)]

    return await request.app.state.cache.fetch(f"inc:{provider.name}:{key}", settings.flow_ttl_seconds, load)


async def ai_selection(request: Request) -> dict | None:
    saved = await request.app.state.cache.get(AI_SETTING_KEY)
    return saved or ({"provider": settings.ai_provider} if settings.ai_provider else None)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status(request: Request):
    provider = request.app.state.provider
    return {
        "provider": provider_meta(provider) if provider else None,
        "ai_ready": ai.is_ready(await ai_selection(request)),
        "history_enabled": request.app.state.history.pool is not None,
        "time": utcnow().isoformat(),
    }


@app.get("/api/search")
async def search(request: Request, q: str = Query(..., min_length=2, max_length=200)):
    state = request.app.state
    norm = " ".join(q.lower().split())
    results, _ = await state.cache.fetch(f"geo:{norm}", 7 * 86400, lambda: geocode.search(state.client, norm))
    return {"results": results, "attribution": "© OpenStreetMap contributors, via Nominatim"}


@app.get("/api/places")
async def places(request: Request, box: BBox = Depends(parse_bbox)):
    state = request.app.state
    clipped, _ = geo.clamp_bbox(box, 1.0)
    b = clipped.model_dump()
    key = "places:" + ",".join(f"{v:.3f}" for v in b.values())
    rows, _ = await state.cache.fetch(key, 86400, lambda: geocode.places(state.client, b))
    return {"places": rows, "attribution": "© OpenStreetMap contributors, via Overpass"}


@app.get("/api/traffic/segments")
async def segments(
    request: Request,
    box: BBox = Depends(parse_bbox),
    zoom: float = Query(..., ge=0, le=24),
    provider=Depends(need_provider),
):
    cells = geo.grid_cells(box, CELL)
    if len(cells) > MAX_CELLS:
        raise HTTPException(422, {"code": "area_too_large", "detail": "Zoom in to load road segments."})
    fc = 3 if zoom < 12.5 else 4 if zoom < 14.5 else 5

    async def one(cell):
        key = f"{fc}:{cell[0]}:{cell[1]}"
        return await fetch_flow(request, provider, geo.cell_bbox(cell, CELL), fc, key, settings.flow_ttl_seconds)

    results = await asyncio.gather(*(one(c) for c in cells))
    records = analysis.dedupe([r for batch, _ in results for r in batch["records"]])
    features = [
        {
            "type": "Feature",
            "id": i,
            "geometry": {"type": "LineString", "coordinates": r["segment"]["geometry"]},
            "properties": {
                "id": r["segment"]["id"],
                "name": r["segment"]["road_name"],
                "level": r["observation"]["congestion_level"],
                "speed": r["observation"]["speed_kmh"],
                "basis": r["observation"]["data_basis"],
            },
        }
        for i, r in enumerate(records)
    ]
    retrieved = min((b["retrieved_at"] for b, _ in results), default=None)
    observed = max((b["source_updated"] for b, _ in results if b["source_updated"]), default=None)
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "provider": provider.name,
            "attribution": provider.attribution,
            "retrieved_at": retrieved,
            "observed_at": observed,
            "stale": any(s for _, s in results),
            "summary": analysis.summarize(records),
        },
    }


async def named(request: Request, provider, record: dict) -> dict:
    """Adds an OpenStreetMap road name when the traffic provider has none. A failed lookup only leaves it unnamed."""
    if record["segment"]["road_name"] or provider.capabilities.get("road_names", True):
        return record
    state = request.app.state
    lon, lat = geo.midpoint(record["segment"]["geometry"])

    async def load():
        return {"name": await geocode.road_name(state.client, lat, lon)}

    try:
        found, _ = await state.cache.fetch(f"rev:{lat:.4f}:{lon:.4f}", 30 * 86400, load)
    except UpstreamError:
        return record
    record["segment"]["road_name"] = found["name"]
    await state.cache.set(f"seg:{record['segment']['id']}", record, SEGMENT_TTL)
    return record


async def segment_response(request: Request, provider, record: dict) -> dict:
    record = await named(request, provider, record)
    lon, lat = geo.midpoint(record["segment"]["geometry"])
    box = BBox(west=lon - 0.003, south=lat - 0.003, east=lon + 0.003, north=lat + 0.003)
    try:
        nearby, _ = await fetch_incidents(request, provider, box, f"{lon:.3f}:{lat:.3f}")
        incidents_error = None
    except UpstreamError as exc:
        nearby, incidents_error = [], str(exc)
    return {
        **record,
        "delay_seconds": analysis.delay_seconds(record["observation"]),
        "incidents": nearby,
        "incidents_error": incidents_error,
        "provider": provider_meta(provider),
    }


@app.get("/api/traffic/segment/{segment_id}")
async def segment_detail(request: Request, segment_id: str, provider=Depends(need_provider)):
    record = await request.app.state.cache.get(f"seg:{segment_id}")
    if record is None:
        raise HTTPException(404, {"code": "segment_expired", "detail": "Segment no longer cached. Refresh traffic."})
    return await segment_response(request, provider, record)


@app.get("/api/traffic/at")
async def traffic_at(
    request: Request,
    lat: float = Query(...),
    lon: float = Query(...),
    zoom: int = Query(..., ge=0, le=22),
    provider=Depends(need_provider),
):
    """Nearest road to a map click, for providers that answer per point."""
    if not provider.capabilities.get("point_lookup"):
        raise HTTPException(404, {"code": "not_supported", "detail": "Provider has no point lookup."})
    if not geo.valid_india_bbox(BBox(west=lon, south=lat, east=lon + 1e-6, north=lat + 1e-6)):
        raise HTTPException(422, {"code": "bad_point", "detail": "Point must lie inside the India region."})
    state = request.app.state

    async def load():
        found = await provider.flow_at(lat, lon, zoom)
        return found.model_dump(mode="json") if found else {}

    record, _ = await state.cache.fetch(f"at:{lat:.4f}:{lon:.4f}:{zoom}", settings.flow_ttl_seconds, load)
    if not record or geo.distance_to_line_km(lat, lon, record["segment"]["geometry"]) > MAX_CLICK_KM:
        raise HTTPException(404, {"code": "no_road_nearby", "detail": "No road with traffic data near this point."})
    await state.cache.set(f"seg:{record['segment']['id']}", record, SEGMENT_TTL)
    return await segment_response(request, provider, record)


@app.get("/api/traffic/tiles/{z}/{x}/{y}.png")
async def traffic_tile(request: Request, z: int, x: int, y: int, provider=Depends(need_provider)):
    """Proxy so the provider key never reaches the browser. TomTom sends no-store, so nothing is cached here."""
    if not provider.capabilities.get("flow_tiles"):
        raise HTTPException(404, {"code": "not_supported", "detail": "Provider has no traffic tiles."})
    if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(422, {"code": "bad_tile", "detail": "Invalid tile address."})
    return Response(await provider.tile(z, x, y), media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/api/traffic/national")
async def national(request: Request, provider=Depends(need_provider)):
    gate = asyncio.Semaphore(4)

    async def probe(name, lat, lon):
        d = PROBE_RADIUS_DEG
        box = BBox(west=lon - d, south=lat - d, east=lon + d, north=lat + d)
        try:
            async with gate:
                batch, stale = await fetch_flow(
                    request, provider, box, 3, f"probe:{name}", settings.national_ttl_seconds
                )
        except UpstreamError as exc:
            if exc.kind == "auth":
                raise
            return {"name": name, "lat": lat, "lon": lon, "error": exc.kind, "summary": None, "worst": []}
        records = batch["records"]
        return {
            "name": name,
            "lat": lat,
            "lon": lon,
            "error": None,
            "stale": stale,
            "observed_at": batch["source_updated"],
            "retrieved_at": batch["retrieved_at"],
            "summary": analysis.summarize(records),
            "worst": analysis.worst_segments(records, limit=5),
        }

    cities = await asyncio.gather(*(probe(*p) for p in PROBES[: provider.max_probes]))
    ok = [c for c in cities if c["summary"]]
    km = dict.fromkeys(analysis.LEVELS, 0.0)
    for c in ok:
        for level, v in c["summary"]["km_by_level"].items():
            km[level] += v
    total = sum(km.values())
    hotspots = sorted(
        (
            {**w, "city": c["name"]}
            for c in ok
            for w in c["worst"]
            if w["congestion_level"] in ("severe", "heavy", "moderate")
        ),
        key=lambda h: h["severity"],
        reverse=True,
    )
    # Comparable means enough live road length for the ratio to represent the city.
    ranked = sorted(
        (c for c in ok if c["summary"]["coverage"] >= 0.2 and c["summary"]["speed_ratio"] is not None),
        key=lambda c: c["summary"]["speed_ratio"],
    )
    return {
        "provider": provider_meta(provider),
        "retrieved_at": min((c["retrieved_at"] for c in ok), default=None),
        "observed_at": max((c["observed_at"] for c in ok if c["observed_at"]), default=None),
        "stale": any(c.get("stale") for c in ok),
        "probes_total": len(cities),
        "probes_ok": len(ok),
        "km_by_level": {k: round(v, 2) for k, v in km.items()},
        "total_km": round(total, 2),
        "coverage": round((total - km["unavailable"]) / total, 3) if total else 0.0,
        "cities": [{k: c[k] for k in ("name", "lat", "lon", "error", "summary")} for c in cities],
        "most_congested": [{"name": c["name"], **c["summary"]} for c in ranked[:8]],
        "hotspots": hotspots[:60],
    }


class ReportRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    bbox: BBox


@app.post("/api/report")
async def report(body: ReportRequest, request: Request, provider=Depends(need_provider)):
    if not geo.valid_india_bbox(body.bbox):
        raise HTTPException(422, {"code": "bad_bbox", "detail": "Bounding box must lie inside the India region."})
    state = request.app.state
    box, clipped = geo.clamp_bbox(body.bbox, provider.max_bbox_side)
    key = ",".join(f"{v:.3f}" for v in box.model_dump().values())
    batch, stale = await fetch_flow(request, provider, box, 4, f"report:{key}", settings.flow_ttl_seconds)
    try:
        incidents, _ = await fetch_incidents(request, provider, box, f"report:{key}")
        incidents_available = True
    except UpstreamError:
        incidents, incidents_available = [], False
    by_id = {r["segment"]["id"]: r for r in batch["records"]}
    for brief in analysis.worst_segments(batch["records"], limit=NAMED_IN_REPORT):
        await named(request, provider, by_id[brief["id"]])
    b = box.model_dump()
    result = analysis.build_report(
        body.name,
        b,
        clipped,
        batch["records"],
        incidents,
        await state.history.compare(b),
        provider_meta(provider),
        batch["retrieved_at"],
        utcnow().isoformat(),
        stale,
        incidents_available,
    )
    result["id"] = uuid.uuid4().hex
    await state.cache.set(f"report:{result['id']}", result, REPORT_TTL)
    return result


def need_admin(x_admin_token: str = Header(default="")):
    if not settings.admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(403, {"code": "admin_required", "detail": "Valid admin token required."})


class AiSetting(BaseModel):
    provider: str | None = None
    model: str | None = Field(default=None, max_length=100)


@app.get("/api/settings/ai")
async def get_ai_settings(request: Request):
    return {
        "selection": await ai_selection(request),
        "providers": ai.provider_list(),
        "admin_enabled": bool(settings.admin_token),
    }


@app.put("/api/settings/ai", dependencies=[Depends(need_admin)])
async def put_ai_settings(body: AiSetting, request: Request):
    if body.provider and body.provider not in ai.ADAPTERS:
        raise HTTPException(422, {"code": "unknown_provider", "detail": "Unknown AI provider."})
    await request.app.state.cache.set(AI_SETTING_KEY, body.model_dump(), None)
    return await get_ai_settings(request)


class AskRequest(BaseModel):
    report_id: str | None = None
    segment_ids: list[str] = Field(default_factory=list, max_length=5)
    question: str | None = Field(default=None, max_length=1000)


@app.post("/api/ai/ask")
async def ask(body: AskRequest, request: Request):
    state = request.app.state
    selection = await ai_selection(request)
    if not ai.is_ready(selection):
        raise HTTPException(503, {"code": "ai_not_configured", "detail": "No AI provider configured."})
    evidence: dict = {}
    if body.report_id:
        evidence["report"] = await state.cache.get(f"report:{body.report_id}")
    records = [await state.cache.get(f"seg:{i}") for i in body.segment_ids]
    if any(records):
        evidence["segments"] = [analysis.segment_brief(r) | {"estimate": r["estimate"]} for r in records if r]
    if not any(evidence.values()):
        raise HTTPException(404, {"code": "no_evidence", "detail": "Report or segments expired. Regenerate them."})
    try:
        return await ai.ask(state.client, selection, evidence, body.question)
    except (KeyError, IndexError, TypeError):
        raise HTTPException(
            502, {"code": "ai_bad_response", "detail": "AI provider returned no usable text."}
        ) from None
