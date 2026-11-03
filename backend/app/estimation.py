"""Deterministic vehicle estimation from the fundamental relation q = k * v.

k = q / v (veh/km), N = k * L = q * L / v. Only ever fed measurements from one observation,
so flow and speed refer to the same segment, direction and time interval.
"""

import math
from datetime import UTC, datetime

from .schemas import ModelledEstimate, TrafficEstimate

METHOD = "fundamental_relation_q=kv"
# Below this mean speed traffic is stop-and-go: q = k*v assumes steady flow and stops being trustworthy.
NON_STEADY_SPEED_KMH = 10.0
# Above this density (all lanes, any road) the inputs are almost certainly inconsistent.
IMPLAUSIBLE_DENSITY = 400.0
# Heuristic band, not a measured error: 15% base, widened by low provider confidence and non-steady flow.
BASE_UNCERTAINTY = 0.15


def estimate_vehicles(
    segment_id: str,
    flow_vph: float | None,
    speed_kmh: float | None,
    length_km: float | None,
    confidence: float | None = None,
) -> TrafficEstimate:
    def result(status, notes, **kw):
        return TrafficEstimate(
            segment_id=segment_id,
            status=status,
            estimate_method=METHOD,
            notes=notes,
            calculated_at=datetime.now(UTC),
            **kw,
        )

    if flow_vph is None:
        return result("unavailable", ["Provider does not report traffic volume for this segment."])
    if speed_kmh is None:
        return result("unavailable", ["No observed speed."])
    if length_km is None or length_km <= 0:
        return result("unavailable", ["Invalid segment length."])
    if flow_vph < 0 or speed_kmh < 0:
        return result("unavailable", ["Negative flow or speed in source data."])
    if speed_kmh == 0:
        return result("unavailable", ["Speed is zero: q = k*v cannot give a density for stopped traffic."])

    density = flow_vph / speed_kmh
    count = density * length_km
    notes: list[str] = ["Estimate, not an exact count."]
    status = "ok"
    if speed_kmh < NON_STEADY_SPEED_KMH:
        status = "unreliable"
        notes.append("Stop-and-go speed: steady-flow assumption is weak.")
    if density > IMPLAUSIBLE_DENSITY:
        status = "unreliable"
        notes.append("Implied density is physically implausible; flow and speed may be inconsistent.")

    uncertainty = low = high = None
    if confidence is not None:
        uncertainty = BASE_UNCERTAINTY + (1 - min(max(confidence, 0.0), 1.0)) * 0.5
        if speed_kmh < NON_STEADY_SPEED_KMH:
            uncertainty += 0.25
        low, high = count * max(0.0, 1 - uncertainty), count * (1 + uncertainty)
        notes.append("Interval is a heuristic band from provider confidence, not a statistical interval.")
    else:
        notes.append("No provider confidence: no interval.")

    return result(
        status,
        notes,
        estimated_density=density,
        estimated_vehicle_count=count,
        count_low=low,
        count_high=high,
        uncertainty=uncertainty,
    )


MODEL_METHOD = "speed_density_greenshields_underwood"
# Assumed, not calibrated for India: a general reference value for 5 m vehicles.
JAM_DENSITY_RANGE = (150.0, 200.0)
# Both models return about zero near free flow, while real roads hold free-flow speed up to about 15 veh/km.
LIGHT_TRAFFIC_RATIO = 0.9
# Lanes per direction when OpenStreetMap has no tag. Rough assumption by road class.
DEFAULT_LANES = {
    "Motorway": (2, 3),
    "Highway": (2, 3),
    "Major road": (2, 3),
    "Arterial": (1, 2),
    "Secondary road": (1, 2),
    "Connecting road": (1, 2),
    "Collector": (1, 2),
}


def model_vehicles(
    segment_id: str,
    speed_kmh: float | None,
    free_flow_kmh: float | None,
    length_km: float | None,
    road_class: str | None,
    data_basis: str,
    osm_lanes: int | None = None,
) -> ModelledEstimate:
    """Vehicle range from speed alone: k = kj(1 - v/vf) and k = (kj/2) ln(vf/v), then N = k * L * lanes."""

    def result(status, notes, **kw):
        return ModelledEstimate(
            segment_id=segment_id,
            status=status,
            estimate_method=MODEL_METHOD,
            notes=notes,
            calculated_at=datetime.now(UTC),
            **kw,
        )

    if data_basis != "realtime":
        return result("unavailable", ["No live speed, so no modelled estimate."])
    if not speed_kmh or speed_kmh < 0 or not free_flow_kmh or free_flow_kmh <= 0 or not length_km or length_km <= 0:
        return result("unavailable", ["Speed, free-flow speed or length is missing, zero or invalid."])

    ratio = speed_kmh / free_flow_kmh
    if ratio >= LIGHT_TRAFFIC_RATIO:
        return result("light", ["Near free-flow speed: the road looks light, but speed cannot show how many vehicles."])

    kj_low, kj_high = JAM_DENSITY_RANGE
    candidates = [
        kj_low * (1 - ratio),
        kj_high * (1 - ratio),
        kj_low / 2 * math.log(1 / ratio),
        kj_high / 2 * math.log(1 / ratio),
    ]
    # Underwood has no upper limit as speed falls, so it is capped at the assumed jam density.
    density_low, density_high = min(candidates), min(max(candidates), kj_high)
    lanes_low, lanes_high = (osm_lanes, osm_lanes) if osm_lanes else DEFAULT_LANES.get(road_class, (1, 1))
    return result(
        "ok",
        [
            "Modelled from speed, not measured. Accuracy has not been validated.",
            f"Assumes jam density {kj_low:.0f} to {kj_high:.0f} vehicles/km per lane, not calibrated for India.",
            "Counts every vehicle alike, so scooters and buses are not told apart.",
        ],
        density_low=density_low,
        density_high=density_high,
        count_low=density_low * length_km * lanes_low,
        count_high=density_high * length_km * lanes_high,
        lanes_low=lanes_low,
        lanes_high=lanes_high,
        lanes_source="openstreetmap" if osm_lanes else "assumed_from_road_class",
    )
