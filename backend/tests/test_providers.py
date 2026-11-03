from datetime import UTC, datetime

import pytest

from app.providers.here import data_basis, normalize_flow, normalize_incidents

NOW = datetime(2026, 11, 3, tzinfo=UTC)


def test_normalize_converts_units_and_keeps_provenance(payload):
    batch = normalize_flow(payload(speed=5, free=10), NOW)
    rec = batch.records[0]
    assert rec.segment.road_name == "MG Road"
    assert rec.segment.length_km == pytest.approx(2)
    assert rec.segment.geometry == [[80.90, 26.80], [80.90, 26.81], [80.90, 26.82]]  # shared vertex joined
    assert rec.segment.road_class == "Major road"
    assert rec.segment.direction == "N"
    obs = rec.observation
    assert obs.speed_kmh == pytest.approx(18)
    assert obs.free_flow_speed_kmh == pytest.approx(36)
    assert obs.congestion_level == "moderate"
    assert obs.provider == "here"
    assert obs.observed_at.isoformat() == "2026-11-03T04:00:00+00:00"
    assert obs.retrieved_at == NOW
    assert obs.travel_time_seconds == pytest.approx(400)


def test_volume_is_never_invented(payload):
    rec = normalize_flow(payload(), NOW).records[0]
    assert rec.observation.flow_vehicles_per_hour is None
    assert rec.estimate.status == "unavailable"
    assert rec.estimate.estimated_vehicle_count is None


@pytest.mark.parametrize(
    "conf,basis",
    [(0.99, "realtime"), (0.71, "realtime"), (0.7, "historical"), (0.6, "historical"), (0.5, "speed_limit")],
)
def test_confidence_bands(conf, basis):
    assert data_basis(conf) == basis


def test_non_realtime_data_does_not_get_a_congestion_colour(payload):
    assert normalize_flow(payload(confidence=0.6), NOW).records[0].observation.congestion_level == "unavailable"
    assert normalize_flow(payload(confidence=0.4), NOW).records[0].observation.congestion_level == "unavailable"


def test_closed_road_is_severe(payload):
    rec = normalize_flow(payload(traversability="closed", speed=0), NOW).records[0]
    assert rec.observation.congestion_level == "severe"
    assert rec.observation.incident_status == "closed"


def test_missing_fields_are_tolerated():
    batch = normalize_flow(
        {
            "results": [
                {"location": {"shape": {"links": []}}, "currentFlow": {}},
                {
                    "location": {"shape": {"links": [{"points": [{"lat": 1, "lng": 2}, {"lat": 1.01, "lng": 2}]}]}},
                    "currentFlow": {},
                },
            ]
        },
        NOW,
    )
    assert len(batch.records) == 1
    rec = batch.records[0]
    assert rec.observation.speed_kmh is None
    assert rec.observation.congestion_level == "unavailable"
    assert rec.segment.length_km > 1


def test_normalize_incidents():
    out = normalize_incidents(
        {
            "results": [
                {
                    "location": {"shape": {"links": []}},
                    "incidentDetails": {
                        "id": 7,
                        "type": "accident",
                        "criticality": "major",
                        "roadClosed": True,
                        "description": {"value": "Crash"},
                        "startTime": "2026-11-03T03:00:00Z",
                    },
                }
            ]
        }
    )
    assert out[0].road_closed and out[0].description == "Crash" and out[0].id == "7"
