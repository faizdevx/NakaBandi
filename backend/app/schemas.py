from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

CongestionLevel = Literal["free", "moderate", "heavy", "severe", "unavailable"]
# realtime = live probes; historical / speed_limit are provider fallbacks and must never read as live traffic.
DataBasis = Literal["realtime", "historical", "speed_limit", "unknown"]


class RoadSegment(BaseModel):
    id: str
    osm_id: int | None = None
    road_name: str | None = None
    geometry: list[list[float]]  # [lon, lat], in provider shape order
    road_class: str | None = None
    length_km: float
    direction: str | None = None


class TrafficObservation(BaseModel):
    segment_id: str
    provider: str
    observed_at: datetime | None = None
    retrieved_at: datetime
    speed_kmh: float | None = None
    free_flow_speed_kmh: float | None = None
    flow_vehicles_per_hour: float | None = None
    congestion_level: CongestionLevel = "unavailable"
    travel_time_seconds: float | None = None
    free_flow_travel_time_seconds: float | None = None
    incident_status: str | None = None
    confidence: float | None = None
    data_basis: DataBasis = "unknown"
    raw_source_metadata: dict[str, Any] = Field(default_factory=dict)


class TrafficEstimate(BaseModel):
    segment_id: str
    status: Literal["ok", "unreliable", "unavailable"]
    estimated_density: float | None = None
    estimated_vehicle_count: float | None = None
    count_low: float | None = None
    count_high: float | None = None
    estimate_method: str
    uncertainty: float | None = None
    notes: list[str] = Field(default_factory=list)
    calculated_at: datetime


class TrafficRecord(BaseModel):
    segment: RoadSegment
    observation: TrafficObservation
    estimate: TrafficEstimate


class Incident(BaseModel):
    id: str
    provider: str
    type: str | None = None
    criticality: str | None = None
    road_closed: bool = False
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    geometry: list[list[float]] = Field(default_factory=list)


class FlowBatch(BaseModel):
    provider: str
    source_updated: datetime | None = None
    retrieved_at: datetime
    records: list[TrafficRecord]


class BBox(BaseModel):
    west: float
    south: float
    east: float
    north: float
