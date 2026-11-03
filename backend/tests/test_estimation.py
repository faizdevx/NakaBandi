import pytest

from app.estimation import estimate_vehicles


def test_density_and_count_follow_q_equals_kv():
    e = estimate_vehicles("s", flow_vph=1200, speed_kmh=40, length_km=2, confidence=1.0)
    assert e.status == "ok"
    assert e.estimated_density == pytest.approx(30)
    assert e.estimated_vehicle_count == pytest.approx(60)
    assert e.count_low == pytest.approx(51)
    assert e.count_high == pytest.approx(69)


@pytest.mark.parametrize(
    "flow,speed,length",
    [(None, 40, 2), (1200, None, 2), (1200, 0, 2), (1200, 40, 0), (1200, 40, None), (-1, 40, 2), (1200, -5, 2)],
)
def test_invalid_inputs_never_produce_a_count(flow, speed, length):
    e = estimate_vehicles("s", flow, speed, length)
    assert e.status == "unavailable"
    assert e.estimated_vehicle_count is None
    assert e.estimated_density is None


def test_stop_and_go_is_flagged_and_widened():
    steady = estimate_vehicles("s", 300, 40, 1, 0.8)
    crawl = estimate_vehicles("s", 300, 5, 1, 0.8)
    assert crawl.status == "unreliable"
    assert crawl.uncertainty > steady.uncertainty


def test_implausible_density_is_flagged():
    assert estimate_vehicles("s", 50000, 20, 1, 1.0).status == "unreliable"


def test_no_confidence_means_no_interval():
    e = estimate_vehicles("s", 1200, 40, 2, None)
    assert e.estimated_vehicle_count == pytest.approx(60)
    assert e.count_low is None and e.uncertainty is None
