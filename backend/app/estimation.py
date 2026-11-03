"""Deterministic vehicle estimation from the fundamental relation q = k * v.

k = q / v (veh/km), N = k * L = q * L / v. Only ever fed measurements from one observation,
so flow and speed refer to the same segment, direction and time interval.
"""

from datetime import UTC, datetime

from .schemas import TrafficEstimate

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
