"""Nominatim search and Overpass context. Policies: 1 req/s, identifying User-Agent, cache results, no autocomplete."""

import asyncio
import time

from .config import settings
from .http import request_json

_lock = asyncio.Lock()
_last = 0.0


def headers() -> dict:
    return {"User-Agent": settings.geo_user_agent}


def parse_search(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        south, north, west, east = map(float, r["boundingbox"])
        out.append(
            {
                "id": f"{r['osm_type']}/{r['osm_id']}",
                "name": r.get("name") or r["display_name"].split(",")[0],
                "display_name": r["display_name"],
                "kind": r.get("addresstype") or r.get("type"),
                "category": r.get("category"),
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
                "bbox": {"west": west, "south": south, "east": east, "north": north},
                "geojson": r.get("geojson"),
            }
        )
    return out


async def _nominatim(client, path: str, params: dict):
    global _last
    # shortcut: spacing is per process, run one API worker or self-host Nominatim to scale.
    async with _lock:
        await asyncio.sleep(max(0.0, 1.0 - (time.monotonic() - _last)))
        try:
            return await request_json(
                client,
                "nominatim",
                "GET",
                f"{settings.nominatim_url}/{path}",
                params=params,
                headers=headers(),
                retries=1,
            )
        finally:
            _last = time.monotonic()


async def search(client, q: str) -> list[dict]:
    params = {
        "q": q,
        "countrycodes": "in",
        "format": "jsonv2",
        "limit": 8,
        "polygon_geojson": 1,
        "polygon_threshold": 0.002,
    }
    return parse_search(await _nominatim(client, "search", params))


async def road_name(client, lat: float, lon: float) -> str | None:
    params = {"lat": lat, "lon": lon, "zoom": 17, "format": "jsonv2"}
    row = await _nominatim(client, "reverse", params)
    return (row.get("address") or {}).get("road")


def overpass_query(b: dict) -> str:
    box = f"{b['south']},{b['west']},{b['north']},{b['east']}"
    return (
        f"[out:json][timeout:45][bbox:{box}];"
        'node[place~"^(suburb|neighbourhood|quarter)$"][name];out 80;'
        'node[tourism~"^(attraction|museum)$"][name];out 40;'
        "node[highway=traffic_signals];out 150;"
    )


def parse_places(payload: dict) -> list[dict]:
    out = []
    for e in payload.get("elements") or []:
        tags = e.get("tags") or {}
        kind = "locality" if "place" in tags else "landmark" if "tourism" in tags else "junction"
        out.append({"id": e["id"], "kind": kind, "name": tags.get("name"), "lat": e["lat"], "lon": e["lon"]})
    return out


async def places(client, bbox: dict) -> list[dict]:
    # Policy asks for a 30 s pause on 429/406, so no fast retries here.
    payload = await request_json(
        client,
        "overpass",
        "POST",
        settings.overpass_url,
        data={"data": overpass_query(bbox)},
        headers=headers(),
        retries=0,
        timeout=60,
    )
    return parse_places(payload)
