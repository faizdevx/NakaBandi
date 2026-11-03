"""TomTom Traffic API. Docs: https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data

One flow call answers for one point, and the free tier allows 20K a month, so areas are sampled on a coarse grid
and the map colours come from TomTom's tiles. No road name, length, timestamp or volume in the response.
Coordinate order is not documented as travel direction, so no heading is reported from it.
"""

import asyncio
import hashlib
from datetime import date, datetime

from ..analysis import classify, travel_time_seconds
from ..cache import utcnow
from ..config import settings
from ..estimation import estimate_vehicles, model_vehicles
from ..geo import line_length_km
from ..http import UpstreamError, request_json
from ..schemas import BBox, FlowBatch, Incident, RoadSegment, TrafficObservation, TrafficRecord

BASE = "https://api.tomtom.com/traffic"
ROAD_CLASS = {
    "FRC0": "Motorway",
    "FRC1": "Major road",
    "FRC2": "Major road",
    "FRC3": "Secondary road",
    "FRC4": "Connecting road",
    "FRC5": "Local road",
    "FRC6": "Local road",
    "FRC7": "Minor road",
}
INCIDENT_TYPE = {
    0: "Unknown",
    1: "Accident",
    2: "Fog",
    3: "Dangerous conditions",
    4: "Rain",
    5: "Ice",
    6: "Traffic jam",
    7: "Lane closed",
    8: "Road closed",
    9: "Road works",
    10: "Wind",
    11: "Flooding",
    14: "Broken down vehicle",
}
SEVERITY = {0: "unknown", 1: "minor", 2: "moderate", 3: "major", 4: "undefined"}
INCIDENT_FIELDS = (
    "{incidents{type,properties{id,iconCategory,magnitudeOfDelay,startTime,endTime,events{description},from,to,delay}}}"
)
# TomTom documents confidence only as 0 to 1 quality. This cut-off for "treat as live" is Nakabandi's choice.
LIVE_CONFIDENCE = 0.7


def parse_time(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def normalize_flow(payload: dict, retrieved_at: datetime) -> TrafficRecord | None:
    d = payload.get("flowSegmentData") or {}
    points = (d.get("coordinates") or {}).get("coordinate") or []
    line = [[p["longitude"], p["latitude"]] for p in points]
    if len(line) < 2:
        return None
    seg_id = "tomtom-" + hashlib.sha1(repr(line).encode()).hexdigest()[:16]
    length_km = line_length_km(line)
    speed, free, confidence = d.get("currentSpeed"), d.get("freeFlowSpeed"), d.get("confidence")
    basis = "unknown" if confidence is None or confidence < LIVE_CONFIDENCE else "realtime"
    # TomTom flags a whole segment, sometimes 18 km long, when part of it is closed. Moving traffic means the rest is open.
    flagged = bool(d.get("roadClosure"))
    closed = flagged and not speed
    return TrafficRecord(
        segment=RoadSegment(id=seg_id, geometry=line, road_class=ROAD_CLASS.get(d.get("frc")), length_km=length_km),
        observation=TrafficObservation(
            segment_id=seg_id,
            provider="tomtom",
            retrieved_at=retrieved_at,
            speed_kmh=speed,
            free_flow_speed_kmh=free,
            congestion_level=classify(speed, free, basis, closed),
            travel_time_seconds=d.get("currentTravelTime") or travel_time_seconds(length_km, speed),
            free_flow_travel_time_seconds=d.get("freeFlowTravelTime") or travel_time_seconds(length_km, free),
            incident_status="closed" if closed else "part_closed" if flagged else None,
            confidence=confidence,
            data_basis=basis,
            raw_source_metadata={"frc": d.get("frc"), "roadClosure": flagged},
        ),
        estimate=estimate_vehicles(seg_id, None, speed, length_km, confidence),
        modelled=model_vehicles(seg_id, speed, free, length_km, ROAD_CLASS.get(d.get("frc")), basis),
    )


def normalize_incidents(payload: dict) -> list[Incident]:
    out = []
    for item in payload.get("incidents") or []:
        p = item.get("properties") or {}
        events = "; ".join(e["description"] for e in p.get("events") or [] if e.get("description"))
        where = f"{p['from']} to {p['to']}" if p.get("from") and p.get("to") else p.get("from") or p.get("to")
        icon = p.get("iconCategory")
        out.append(
            Incident(
                id=str(p.get("id")),
                provider="tomtom",
                type=INCIDENT_TYPE.get(icon),
                criticality=SEVERITY.get(p.get("magnitudeOfDelay")),
                road_closed=icon == 8,
                description=", ".join(x for x in (events, where) if x) or None,
                start_time=parse_time(p.get("startTime")),
                end_time=parse_time(p.get("endTime")),
            )
        )
    rank = {"major": 0, "moderate": 1, "minor": 2}
    return sorted(out, key=lambda i: (not i.road_closed, rank.get(i.criticality, 3)))


class TomTomProvider:
    name = "tomtom"
    attribution = "Traffic data © TomTom"
    # About 11 km: wider boxes fill with empty outskirts and report a jammed centre as free flow.
    max_bbox_side = 0.1
    max_probes = 12
    capabilities = {  # noqa: RUF012
        "current_speed": True,
        "free_flow_speed": True,
        "traffic_volume": False,
        "incidents": True,
        "historical_api": False,
        "bbox_flow": False,
        "flow_tiles": True,
        "point_lookup": True,
        "travel_direction": False,
        "road_names": False,
    }

    def __init__(self, client, api_key: str):
        self.client, self.api_key = client, api_key
        self.day = date.today()
        self.used = {"flow": 0, "tile": 0, "incident": 0}

    def _spend(self, kind: str, limit: int):
        # shortcut: per-process and reset on restart, move to Redis if running several API workers.
        if self.day != date.today():
            self.day, self.used = date.today(), dict.fromkeys(self.used, 0)
        if self.used[kind] >= limit:
            raise UpstreamError("tomtom", "rate_limited")
        self.used[kind] += 1

    async def flow_at(self, lat: float, lon: float, zoom: int) -> TrafficRecord | None:
        self._spend("flow", settings.flow_daily_budget)
        payload = await request_json(
            self.client,
            "tomtom",
            "GET",
            f"{BASE}/services/4/flowSegmentData/absolute/{zoom}/json",
            params={"key": self.api_key, "point": f"{lat:.5f},{lon:.5f}", "unit": "kmph"},
        )
        record = normalize_flow(payload, utcnow())
        if record:
            # TomTom's segment shape depends on zoom, so a live re-read must ask at the same zoom.
            record.observation.raw_source_metadata["zoom"] = zoom
        return record

    async def flow(self, bbox: BBox, max_functional_class: int, dense: bool = False) -> FlowBatch:
        """Samples a grid. Each point snaps to its nearest road, so this covers some roads, not all."""
        side = max(bbox.east - bbox.west, bbox.north - bbox.south)
        n = 5 if dense or side > 0.2 else 2
        gate = asyncio.Semaphore(4)

        async def one(i, j):
            lat = bbox.south + (bbox.north - bbox.south) * (j + 0.5) / n
            lon = bbox.west + (bbox.east - bbox.west) * (i + 0.5) / n
            async with gate:
                try:
                    return await self.flow_at(lat, lon, 12)
                except UpstreamError as exc:
                    # TomTom answers 400 for a point too far from any road: an empty sample, not a failure.
                    if exc.kind == "bad_response":
                        return None
                    raise

        found = await asyncio.gather(*(one(i, j) for i in range(n) for j in range(n)))
        records = list({r.segment.id: r for r in found if r}.values())
        return FlowBatch(provider="tomtom", retrieved_at=utcnow(), records=records)

    async def incidents(self, bbox: BBox) -> list[Incident]:
        self._spend("incident", settings.incident_daily_budget)
        payload = await request_json(
            self.client,
            "tomtom",
            "GET",
            f"{BASE}/services/5/incidentDetails",
            params={
                "key": self.api_key,
                "bbox": f"{bbox.west:.5f},{bbox.south:.5f},{bbox.east:.5f},{bbox.north:.5f}",
                "fields": INCIDENT_FIELDS,
                "language": "en-GB",
                "timeValidityFilter": "present",
            },
        )
        return normalize_incidents(payload)

    async def tile(self, z: int, x: int, y: int) -> bytes:
        self._spend("tile", settings.tile_daily_budget)
        resp = await self.client.get(f"{BASE}/map/4/tile/flow/relative0/{z}/{x}/{y}.png", params={"key": self.api_key})
        if resp.status_code != 200:
            kind = (
                "auth"
                if resp.status_code in (401, 403)
                else "rate_limited"
                if resp.status_code == 429
                else "unavailable"
            )
            raise UpstreamError("tomtom", kind, resp.status_code)
        return resp.content
