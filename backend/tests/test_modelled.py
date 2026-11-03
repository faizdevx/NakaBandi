from datetime import UTC, datetime

import pytest

from app import analysis
from app.estimation import model_vehicles
from app.geocode import lanes_per_direction
from app.providers.here import normalize_flow


def model(speed=22, free=31, length=1, road_class=None, basis="realtime", lanes=2):
    return model_vehicles("s", speed, free, length, road_class, basis, lanes)


def test_range_spans_both_models_and_assumed_jam_density():
    m = model()
    assert m.status == "ok" and m.lanes_source == "openstreetmap"
    assert m.density_low == pytest.approx(25.7, abs=0.1)  # Underwood, kj 150
    assert m.density_high == pytest.approx(58.1, abs=0.1)  # Greenshields, kj 200
    assert m.count_low == pytest.approx(51.4, abs=0.2)
    assert m.count_high == pytest.approx(116.1, abs=0.2)


def test_density_never_exceeds_jam_density_at_crawling_speed():
    assert model(speed=1, free=60).density_high == 200


@pytest.mark.parametrize("speed", [28, 31, 45])
def test_near_free_flow_gives_no_number(speed):
    m = model(speed=speed)
    assert m.status == "light"
    assert m.count_low is None and m.count_high is None


@pytest.mark.parametrize(
    "kw",
    [
        {"basis": "historical"},
        {"basis": "speed_limit"},
        {"basis": "unknown"},
        {"speed": None},
        {"speed": 0},
        {"speed": -5},
        {"free": None},
        {"free": 0},
        {"length": 0},
        {"length": None},
    ],
)
def test_invalid_or_non_live_inputs_never_produce_a_number(kw):
    m = model(**kw)
    assert m.status == "unavailable" and m.count_low is None


def test_assumed_lanes_widen_the_range_and_say_so():
    m = model(road_class="Motorway", lanes=None)
    assert (m.lanes_low, m.lanes_high) == (2, 3)
    assert m.lanes_source == "assumed_from_road_class"
    assert model(road_class="Minor road", lanes=None).lanes_high == 1


@pytest.mark.parametrize(
    "tags,want",
    [
        ({"lanes": "4"}, 2),
        ({"lanes": "3"}, 2),
        ({"lanes": "3", "oneway": "yes"}, 3),
        ({"lanes": "2;3"}, None),
        ({"lanes": "0"}, None),
        ({"lanes": "40"}, None),
        ({}, None),
    ],
)
def test_osm_lanes_are_per_direction_and_validated(tags, want):
    assert lanes_per_direction(tags) == want


def test_report_labels_modelled_sum_apart_from_measured(payload):
    now = datetime(2026, 11, 3, tzinfo=UTC)
    slow = normalize_flow(payload(speed=5, free=10), now).records[0].model_dump(mode="json")
    light = normalize_flow(payload(speed=10, free=10, name="B"), now).records[0].model_dump(mode="json")
    provider = {"name": "here", "attribution": "x", "capabilities": {"traffic_volume": False}}
    r = analysis.build_report(
        "A", {}, False, [slow, light], [], {"available": False, "reason": "off"}, provider, "t", "t", False
    )
    block = r["density_and_counts"]
    assert block["available"] is False  # measured counts stay unavailable
    assert block["modelled"]["roads"] == 1 and block["modelled"]["light_roads"] == 1
    assert block["modelled"]["count_low"] > 0
    assert "modelled from speed" in " ".join(r["provenance"]["limitations"])
    assert r["most_affected"][0]["modelled_vehicles_high"] > r["most_affected"][0]["modelled_vehicles_low"]
