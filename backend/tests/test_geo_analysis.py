from datetime import UTC, datetime

import pytest

from app import analysis, geo
from app.ai import unverified_numbers
from app.providers.here import normalize_flow
from app.schemas import BBox


def rec(payload, **kw):
    return normalize_flow(payload(**kw), datetime(2026, 11, 3, tzinfo=UTC)).records[0].model_dump(mode="json")


def test_haversine_known_distance():
    assert geo.haversine_km([0, 0], [0, 1]) == pytest.approx(111.19, abs=0.01)


def test_midpoint_is_halfway_along_line():
    assert geo.midpoint([[0, 0], [0, 1], [0, 2]]) == pytest.approx([0, 1])
    assert geo.midpoint([[0, 0], [0, 2]]) == pytest.approx([0, 1])


@pytest.mark.parametrize(
    "line,want",
    [([[0, 0], [0, 1]], "N"), ([[0, 1], [0, 0]], "S"), ([[0, 0], [1, 0]], "E"), ([[1, 0], [0, 0]], "W")],
)
def test_compass(line, want):
    assert geo.compass(line) == want


def test_bbox_guard_rejects_outside_india_and_inverted():
    assert geo.valid_india_bbox(BBox(west=80, south=26, east=81, north=27))
    assert not geo.valid_india_bbox(BBox(west=-74, south=40, east=-73, north=41))
    assert not geo.valid_india_bbox(BBox(west=81, south=26, east=80, north=27))


def test_grid_cells_are_snapped_and_cover_bbox():
    cells = geo.grid_cells(BBox(west=80.1, south=26.1, east=80.4, north=26.2), 0.25)
    assert cells == [(320, 104), (321, 104)]
    assert geo.cell_bbox((320, 104), 0.25).west == 80.0


def test_clamp_keeps_centre_and_reports_clipping():
    box, clipped = geo.clamp_bbox(BBox(west=70, south=20, east=74, north=22), 1.0)
    assert clipped and box.east - box.west == 1.0 and (box.west + box.east) / 2 == 72
    box, clipped = geo.clamp_bbox(BBox(west=80.5, south=26.5, east=80.5, north=26.5), 1.0)
    assert not clipped and box.east > box.west


@pytest.mark.parametrize(
    "speed,free,level",
    [
        (30, 40, "free"),
        (20, 40, "moderate"),
        (10, 40, "heavy"),
        (5, 40, "severe"),
        (None, 40, "unavailable"),
        (5, 0, "unavailable"),
    ],
)
def test_classify(speed, free, level):
    assert analysis.classify(speed, free, "realtime") == level


def test_summary_is_length_weighted_and_excludes_unmeasured(payload):
    s = analysis.summarize([rec(payload, speed=5, free=10), rec(payload, confidence=0.4)])
    assert s["total_km"] == 4 and s["measured_km"] == 2 and s["coverage"] == 0.5
    assert s["avg_speed_kmh"] == 18 and s["speed_ratio"] == 0.5


def test_summary_of_nothing_is_unavailable_not_zero_traffic():
    s = analysis.summarize([])
    assert s["overall"] == "unavailable" and s["avg_speed_kmh"] is None


def test_worst_segments_excludes_unmeasured(payload):
    assert analysis.worst_segments([rec(payload, confidence=0.4)]) == []
    assert analysis.worst_segments([rec(payload)])[0]["severity"] == 0.5


def test_report_states_missing_volume_and_provenance(payload):
    provider = {"name": "here", "attribution": "x", "capabilities": {"traffic_volume": False}}
    r = analysis.build_report(
        "Lucknow",
        {},
        True,
        [rec(payload, speed=1)],
        [],
        {"available": False, "reason": "off"},
        provider,
        "t1",
        "t2",
        False,
    )
    assert r["density_and_counts"]["available"] is False
    assert r["provenance"]["retrieved_at"] == "t1" and r["provenance"]["generated_at"] == "t2"
    text = " ".join(r["provenance"]["limitations"])
    assert "traffic volume" in text and "1° × 1°" in text and "off" in text
    assert "MG Road" in r["recommendations"][0]


def test_unverified_numbers_catches_invented_figures():
    assert unverified_numbers("Speed was 18.4 km/h and 95 cars", '{"speed": 18.37}') == [95.0]
    assert unverified_numbers("3 roads at 18 km/h", '{"speed": 18.37}') == []


def test_segment_brief_reports_closure():
    record = {
        "segment": {"id": "a", "road_name": "A", "road_class": None, "direction": None, "length_km": 1.0, "geometry": [[77.0, 28.0], [77.1, 28.0]]},
        "observation": {"speed_kmh": 33.0, "free_flow_speed_kmh": 37.0, "congestion_level": "severe", "confidence": 1.0, "incident_status": "closed", "data_basis": "realtime", "travel_time_seconds": None},
    }
    assert analysis.segment_brief(record)["road_closed"] is True
    record["observation"]["incident_status"] = None
    assert analysis.segment_brief(record)["road_closed"] is False
