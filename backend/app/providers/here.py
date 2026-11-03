"""HERE Traffic API v7. Docs: https://docs.here.com/traffic-api/docs/flow

Speeds are m/s, lengths metres. No traffic-volume field is documented, so flow stays None.
"""

import hashlib
from datetime import datetime
from typing import ClassVar

from ..analysis import classify, travel_time_seconds
from ..cache import utcnow
from ..estimation import estimate_vehicles
from ..geo import compass, line_length_km
from ..http import request_json
from ..schemas import BBox, FlowBatch, Incident, RoadSegment, TrafficObservation, TrafficRecord

BASE = "https://data.traffic.hereapi.com/v7"
ROAD_CLASS = {1: "Highway", 2: "Major road", 3: "Arterial", 4: "Collector", 5: "Local"}


def data_basis(confidence: float | None) -> str:
    # Documented bands: (0.7, 1] real-time, (0.5, 0.7] historical, (0, 0.5] speed limit.
    if confidence is None:
        return "unknown"
    if confidence > 0.7:
        return "realtime"
    return "historical" if confidence > 0.5 else "speed_limit"


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def shape_points(location: dict) -> tuple[list[list[float]], int | None]:
    """Joined link polylines as [lon, lat], plus the most important functional class."""
    line: list[list[float]] = []
    classes = []
    for link in (location.get("shape") or {}).get("links") or []:
        if link.get("functionalClass"):
            classes.append(link["functionalClass"])
        for p in link.get("points") or []:
            point = [p["lng"], p["lat"]]
            if not line or line[-1] != point:
                line.append(point)
    return line, min(classes, default=None)


def normalize_flow(payload: dict, retrieved_at: datetime) -> FlowBatch:
    source_updated = parse_time(payload.get("sourceUpdated"))
    records = []
    for item in payload.get("results") or []:
        location, flow = item.get("location") or {}, item.get("currentFlow") or {}
        line, fc = shape_points(location)
        if len(line) < 2:
            continue
        seg_id = "here-" + hashlib.sha1(repr(line).encode()).hexdigest()[:16]
        length_km = (location.get("length") or 0) / 1000 or line_length_km(line)
        speed = flow.get("speed")
        free = flow.get("freeFlow")
        speed_kmh = speed * 3.6 if speed is not None else None
        free_kmh = free * 3.6 if free is not None else None
        confidence = flow.get("confidence")
        basis = data_basis(confidence)
        closed = flow.get("traversability") == "closed"
        segment = RoadSegment(
            id=seg_id,
            road_name=location.get("description"),
            geometry=line,
            road_class=ROAD_CLASS.get(fc),
            length_km=length_km,
            direction=compass(line),
        )
        observation = TrafficObservation(
            segment_id=seg_id,
            provider="here",
            observed_at=source_updated,
            retrieved_at=retrieved_at,
            speed_kmh=speed_kmh,
            free_flow_speed_kmh=free_kmh,
            flow_vehicles_per_hour=None,
            congestion_level=classify(speed_kmh, free_kmh, basis, closed),
            travel_time_seconds=travel_time_seconds(length_km, speed_kmh),
            free_flow_travel_time_seconds=travel_time_seconds(length_km, free_kmh),
            incident_status="closed" if closed else None,
            confidence=confidence,
            data_basis=basis,
            raw_source_metadata={
                k: flow[k] for k in ("jamFactor", "traversability", "speedUncapped", "subSegments") if k in flow
            },
        )
        estimate = estimate_vehicles(seg_id, None, speed_kmh, length_km, confidence)
        records.append(TrafficRecord(segment=segment, observation=observation, estimate=estimate))
    return FlowBatch(provider="here", source_updated=source_updated, retrieved_at=retrieved_at, records=records)


def normalize_incidents(payload: dict) -> list[Incident]:
    out = []
    for item in payload.get("results") or []:
        d = item.get("incidentDetails") or {}
        line, _ = shape_points(item.get("location") or {})
        out.append(
            Incident(
                id=str(d.get("id")),
                provider="here",
                type=d.get("type"),
                criticality=d.get("criticality"),
                road_closed=bool(d.get("roadClosed")),
                description=(d.get("description") or {}).get("value") or (d.get("summary") or {}).get("value"),
                start_time=parse_time(d.get("startTime")),
                end_time=parse_time(d.get("endTime")),
                geometry=line,
            )
        )
    return out


class HereProvider:
    name = "here"
    attribution = "Traffic data © HERE"
    max_bbox_side = 1.0
    max_probes = 24
    capabilities: ClassVar[dict[str, bool]] = {
        "current_speed": True,
        "free_flow_speed": True,
        "traffic_volume": False,
        "incidents": True,
        "historical_api": False,
        "bbox_flow": True,
        "flow_tiles": False,
        "point_lookup": False,
        "travel_direction": True,
        "road_names": True,
    }

    def __init__(self, client, api_key: str):
        self.client, self.api_key = client, api_key

    def _in(self, b: BBox) -> str:
        return f"bbox:{b.west:.5f},{b.south:.5f},{b.east:.5f},{b.north:.5f}"

    async def flow(self, bbox: BBox, max_functional_class: int) -> FlowBatch:
        params = {
            "in": self._in(bbox),
            "locationReferencing": "shape",
            "functionalClasses": ",".join(str(i) for i in range(1, max_functional_class + 1)),
            "apiKey": self.api_key,
        }
        payload = await request_json(self.client, "here", "GET", f"{BASE}/flow", params=params)
        return normalize_flow(payload, utcnow())

    async def incidents(self, bbox: BBox) -> list[Incident]:
        params = {"in": self._in(bbox), "locationReferencing": "shape", "lang": "en-US", "apiKey": self.api_key}
        payload = await request_json(self.client, "here", "GET", f"{BASE}/incidents", params=params)
        return normalize_incidents(payload)
