import asyncio
from datetime import UTC, datetime

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import settings
from app.geo import distance_to_line_km
from app.http import UpstreamError
from app.main import app
from app.providers.tomtom import BASE, TomTomProvider, normalize_flow, normalize_incidents
from app.schemas import BBox

NOW = datetime(2026, 11, 3, tzinfo=UTC)
FLOW = f"{BASE}/services/4/flowSegmentData/absolute"


def flow_payload(speed=15, free=30, confidence=0.95, closed=False, lat=26.85):
    return {
        "flowSegmentData": {
            "frc": "FRC2",
            "currentSpeed": speed,
            "freeFlowSpeed": free,
            "currentTravelTime": 240,
            "freeFlowTravelTime": 120,
            "confidence": confidence,
            "roadClosure": closed,
            "coordinates": {
                "coordinate": [
                    {"latitude": lat, "longitude": 80.94},
                    {"latitude": lat + 0.01, "longitude": 80.94},
                ]
            },
        }
    }


@pytest.fixture
def client(monkeypatch):
    for key in ("redis_url", "database_url", "here_api_key", "tomtom_api_key", "ai_provider", "admin_token"):
        monkeypatch.setattr(settings, key, "")
    with TestClient(app) as c:
        app.state.provider = TomTomProvider(app.state.client, "secret-key")
        yield c


def test_normalize_keeps_units_and_never_invents_volume_or_time():
    rec = normalize_flow(flow_payload(), NOW)
    assert rec.observation.speed_kmh == 15 and rec.observation.free_flow_speed_kmh == 30
    assert rec.observation.congestion_level == "moderate"
    assert rec.observation.flow_vehicles_per_hour is None and rec.estimate.status == "unavailable"
    assert rec.observation.observed_at is None and rec.observation.retrieved_at == NOW
    assert rec.segment.road_name is None and rec.segment.direction is None
    assert rec.segment.geometry[0] == [80.94, 26.85]
    assert rec.segment.length_km == pytest.approx(1.11, abs=0.01)
    assert rec.segment.road_class == "Major road"


def test_low_confidence_gets_no_colour_and_closure_is_severe():
    assert normalize_flow(flow_payload(confidence=0.5), NOW).observation.congestion_level == "unavailable"
    stopped = normalize_flow(flow_payload(speed=0, closed=True), NOW).observation
    assert stopped.congestion_level == "severe" and stopped.incident_status == "closed"
    moving = normalize_flow(flow_payload(speed=16, free=28, closed=True), NOW).observation
    assert moving.congestion_level == "moderate" and moving.incident_status == "part_closed"
    assert normalize_flow({"flowSegmentData": {}}, NOW) is None


def test_incidents_sorted_closures_first():
    out = normalize_incidents(
        {
            "incidents": [
                {"properties": {"id": "a", "iconCategory": 6, "magnitudeOfDelay": 1, "from": "A", "to": "B"}},
                {
                    "properties": {
                        "id": "b",
                        "iconCategory": 6,
                        "magnitudeOfDelay": 3,
                        "events": [{"description": "Jam"}],
                    }
                },
                {"properties": {"id": "c", "iconCategory": 8, "magnitudeOfDelay": 4}},
            ]
        }
    )
    assert [i.id for i in out] == ["c", "b", "a"]
    assert out[0].road_closed and out[0].type == "Road closed"
    assert out[1].description == "Jam" and out[2].description == "A to B"


@respx.mock
async def test_grid_sampling_dedupes_and_skips_points_without_roads():
    calls = {"n": 0}

    def answer(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(400, json={"error": "Point too far from nearest existing segment."})
        return httpx.Response(200, json=flow_payload())

    respx.get(url__startswith=FLOW).mock(side_effect=answer)
    async with httpx.AsyncClient() as c:
        batch = await TomTomProvider(c, "k").flow(BBox(west=80.9, south=26.8, east=81.0, north=26.9), 3)
    assert calls["n"] == 4
    assert len(batch.records) == 1


@respx.mock
async def test_daily_budget_stops_calls(monkeypatch):
    monkeypatch.setattr(settings, "flow_daily_budget", 1)
    route = respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload()))
    async with httpx.AsyncClient() as c:
        provider = TomTomProvider(c, "k")
        await provider.flow_at(26.85, 80.94, 14)
        with pytest.raises(UpstreamError) as err:
            await provider.flow_at(26.85, 80.94, 14)
    assert err.value.kind == "rate_limited" and route.call_count == 1


@respx.mock
def test_point_lookup_returns_road_with_name_and_hides_key(client):
    respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload()))
    respx.get(f"{BASE}/services/5/incidentDetails").mock(return_value=httpx.Response(200, json={"incidents": []}))
    respx.get(f"{settings.nominatim_url}/reverse").mock(
        return_value=httpx.Response(200, json={"address": {"road": "Hazratganj Road"}})
    )
    r = client.get("/api/traffic/at?lat=26.855&lon=80.94&zoom=14")
    assert r.status_code == 200
    body = r.json()
    assert body["segment"]["road_name"] == "Hazratganj Road"
    assert body["observation"]["speed_kmh"] == 15
    assert "secret-key" not in r.text
    assert client.get(f"/api/traffic/segment/{body['segment']['id']}").status_code == 200


@respx.mock
def test_point_lookup_rejects_click_far_from_any_road(client):
    respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload()))
    r = client.get("/api/traffic/at?lat=27.5&lon=81.5&zoom=14")
    assert r.status_code == 404 and r.json()["detail"]["code"] == "no_road_nearby"


def test_point_lookup_validates_coordinates(client):
    assert client.get("/api/traffic/at?lat=40&lon=-74&zoom=14").status_code == 422


@respx.mock
def test_tile_proxy_keeps_key_server_side(client):
    route = respx.get(f"{BASE}/map/4/tile/flow/relative0/12/2943/1711.png").mock(
        return_value=httpx.Response(200, content=b"PNG")
    )
    r = client.get("/api/traffic/tiles/12/2943/1711.png")
    assert r.status_code == 200 and r.content == b"PNG" and r.headers["content-type"] == "image/png"
    assert route.calls[0].request.url.params["key"] == "secret-key"
    assert "secret-key" not in str(r.headers)
    assert client.get("/api/traffic/tiles/12/99999/1711.png").status_code == 422
    assert client.get("/api/traffic/tiles/30/1/1.png").status_code == 422


@respx.mock
def test_report_flags_failed_incident_lookup_instead_of_saying_none(client):
    respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload(speed=5)))
    respx.get(f"{BASE}/services/5/incidentDetails").mock(return_value=httpx.Response(403))
    respx.get(f"{settings.nominatim_url}/reverse").mock(return_value=httpx.Response(200, json={"address": {}}))
    r = client.post(
        "/api/report", json={"name": "L", "bbox": {"west": 80.5, "south": 26.5, "east": 81.2, "north": 27.1}}
    ).json()
    assert r["incidents_available"] is False
    assert any("Incident lookup failed" in x for x in r["provenance"]["limitations"])
    assert r["provenance"]["providers"] == ["tomtom"]


def test_distance_to_line():
    line = [[80.0, 26.0], [80.0, 26.1]]
    assert distance_to_line_km(26.05, 80.0, line) == pytest.approx(0, abs=0.001)
    assert distance_to_line_km(26.05, 80.01, line) == pytest.approx(0.99, abs=0.01)
    assert distance_to_line_km(26.2, 80.0, line) == pytest.approx(11.1, abs=0.1)


def age_cached_road(client, seg_id):
    cache = client.app.state.cache
    record = asyncio.run(cache.get(f"seg:{seg_id}"))
    record["observation"]["retrieved_at"] = "2026-01-01T00:00:00+00:00"
    asyncio.run(cache.set(f"seg:{seg_id}", record, 3600))


def mock_road_services():
    respx.get(f"{BASE}/services/5/incidentDetails").mock(return_value=httpx.Response(200, json={"incidents": []}))
    respx.get(f"{settings.nominatim_url}/reverse").mock(
        return_value=httpx.Response(200, json={"address": {"road": "A"}})
    )


@respx.mock
def test_open_road_rereads_when_old_at_same_zoom(client):
    flow = respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload(speed=15)))
    mock_road_services()
    seg_id = client.get("/api/traffic/at?lat=26.855&lon=80.94&zoom=14").json()["segment"]["id"]
    assert flow.call_count == 1

    # Fresh reading: no extra call.
    assert client.get(f"/api/traffic/segment/{seg_id}").json()["observation"]["speed_kmh"] == 15
    assert flow.call_count == 1

    age_cached_road(client, seg_id)
    flow.mock(return_value=httpx.Response(200, json=flow_payload(speed=9)))
    assert client.get(f"/api/traffic/segment/{seg_id}").json()["observation"]["speed_kmh"] == 9
    assert flow.call_count == 2
    assert "/absolute/14/" in str(flow.calls.last.request.url)

    # Within the road TTL the cached re-read answers, so polling spends nothing.
    age_cached_road(client, seg_id)
    assert client.get(f"/api/traffic/segment/{seg_id}").json()["observation"]["speed_kmh"] == 9
    assert flow.call_count == 2


@respx.mock
def test_open_road_keeps_last_reading_when_budget_runs_out(client, monkeypatch):
    respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload(speed=15)))
    mock_road_services()
    seg_id = client.get("/api/traffic/at?lat=26.855&lon=80.94&zoom=14").json()["segment"]["id"]
    age_cached_road(client, seg_id)
    monkeypatch.setattr(settings, "flow_daily_budget", 0)
    r = client.get(f"/api/traffic/segment/{seg_id}")
    assert r.status_code == 200 and r.json()["observation"]["speed_kmh"] == 15


@respx.mock
def test_open_road_keeps_reading_if_point_snaps_to_another_road(client):
    flow = respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload(speed=15)))
    mock_road_services()
    seg_id = client.get("/api/traffic/at?lat=26.855&lon=80.94&zoom=14").json()["segment"]["id"]
    age_cached_road(client, seg_id)
    flow.mock(return_value=httpx.Response(200, json=flow_payload(speed=9, lat=27.5)))
    body = client.get(f"/api/traffic/segment/{seg_id}").json()
    assert body["segment"]["id"] == seg_id and body["observation"]["speed_kmh"] == 15


@respx.mock
def test_report_samples_city_centre_with_full_grid(client):
    flow = respx.get(url__startswith=FLOW).mock(return_value=httpx.Response(200, json=flow_payload()))
    respx.get(f"{BASE}/services/5/incidentDetails").mock(return_value=httpx.Response(200, json={"incidents": []}))
    respx.get(f"{settings.nominatim_url}/reverse").mock(return_value=httpx.Response(200, json={"address": {"road": "A"}}))
    wide = {"west": 81.67, "south": 25.28, "east": 81.99, "north": 25.60}
    body = client.post("/api/report", json={"name": "Prayagraj", "bbox": wide}).json()
    assert flow.call_count == 25
    box = body["provenance"]["bbox"]
    assert box["east"] - box["west"] == pytest.approx(0.1)
    assert (box["west"] + box["east"]) / 2 == pytest.approx(81.83)
    assert any("central 11 km" in x for x in body["provenance"]["limitations"])
