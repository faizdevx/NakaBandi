import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import ai, geocode
from app.cache import Cache
from app.config import settings
from app.http import UpstreamError, request_json
from app.main import app
from app.providers.here import BASE, HereProvider

BBOX = "80.8,26.7,81.0,26.9"


@pytest.fixture
def client(monkeypatch):
    for key in (
        "redis_url",
        "database_url",
        "here_api_key",
        "tomtom_api_key",
        "ai_provider",
        "admin_token",
        "ollama_url",
    ):
        monkeypatch.setattr(settings, key, "")
    with TestClient(app) as c:
        yield c


@pytest.fixture
def live(client):
    app.state.provider = HereProvider(app.state.client, "test-key")
    return client


def test_no_provider_reports_it_instead_of_faking_data(client):
    assert client.get("/api/status").json()["provider"] is None
    r = client.get("/api/traffic/national")
    assert r.status_code == 503 and r.json()["detail"]["code"] == "provider_not_configured"
    assert client.get(f"/api/traffic/segments?bbox={BBOX}&zoom=12").status_code == 503


@respx.mock
def test_segments_then_detail(live, payload):
    respx.get(f"{BASE}/flow").mock(return_value=httpx.Response(200, json=payload()))
    respx.get(f"{BASE}/incidents").mock(return_value=httpx.Response(200, json={"results": []}))
    fc = live.get(f"/api/traffic/segments?bbox={BBOX}&zoom=12").json()
    assert fc["features"][0]["properties"]["level"] == "moderate"
    assert fc["meta"]["observed_at"] and fc["meta"]["retrieved_at"]
    seg_id = fc["features"][0]["properties"]["id"]
    d = live.get(f"/api/traffic/segment/{seg_id}").json()
    assert d["observation"]["speed_kmh"] == pytest.approx(18)
    assert d["estimate"]["status"] == "unavailable"
    assert d["delay_seconds"] == pytest.approx(200)
    assert "test-key" not in str(d)


def test_bbox_trust_boundary(live):
    assert live.get("/api/traffic/segments?bbox=-74,40,-73,41&zoom=12").status_code == 422
    assert live.get("/api/traffic/segments?bbox=abc&zoom=12").status_code == 422
    r = live.get("/api/traffic/segments?bbox=70,20,80,30&zoom=5")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "area_too_large"


@respx.mock
def test_auth_failure_surfaces_without_leaking_key(live):
    respx.get(f"{BASE}/flow").mock(return_value=httpx.Response(401))
    r = live.get("/api/traffic/segments?bbox=75.0,20.0,75.1,20.1&zoom=12")
    assert r.status_code == 502 and r.json()["detail"]["code"] == "here_auth"
    assert "test-key" not in r.text


@respx.mock
def test_report_with_provenance_and_failed_incidents(live, payload):
    respx.get(f"{BASE}/flow").mock(return_value=httpx.Response(200, json=payload(speed=1)))
    respx.get(f"{BASE}/incidents").mock(return_value=httpx.Response(400))
    r = live.post(
        "/api/report", json={"name": "Lucknow", "bbox": {"west": 80.8, "south": 26.7, "east": 81.0, "north": 26.9}}
    ).json()
    assert r["area"] == "Lucknow" and r["hotspots"][0]["road_name"] == "MG Road"
    assert r["provenance"]["providers"] == ["here"] and r["id"]
    assert r["density_and_counts"]["available"] is False


@respx.mock
def test_national_tolerates_failed_probe(live, payload):
    calls = {"n": 0}

    def flaky(request):
        calls["n"] += 1
        return httpx.Response(400) if calls["n"] == 1 else httpx.Response(200, json=payload(speed=2))

    respx.get(f"{BASE}/flow").mock(side_effect=flaky)
    n = live.get("/api/traffic/national").json()
    assert n["probes_total"] == 24 and n["probes_ok"] == 23
    assert n["hotspots"] and n["most_congested"]


async def test_cache_serves_stale_on_failure():
    cache = Cache()

    async def good():
        return {"v": 1}

    async def bad():
        raise UpstreamError("here", "unavailable")

    assert await cache.fetch("k", 300, good) == ({"v": 1}, False)
    del cache.mem["k"]
    assert await cache.fetch("k", 300, bad) == ({"v": 1}, True)
    with pytest.raises(UpstreamError):
        await cache.fetch("other", 300, bad)


@respx.mock
async def test_retry_then_success(monkeypatch):
    async def no_sleep(_):
        pass

    monkeypatch.setattr("asyncio.sleep", no_sleep)
    route = respx.get("https://x.test/").mock(
        side_effect=[httpx.Response(429), httpx.Response(503), httpx.Response(200, json={"ok": 1})]
    )
    async with httpx.AsyncClient() as c:
        assert await request_json(c, "x", "GET", "https://x.test/") == {"ok": 1}
    assert route.call_count == 3


@respx.mock
async def test_rate_limit_exhausted(monkeypatch):
    async def no_sleep(_):
        pass

    monkeypatch.setattr("asyncio.sleep", no_sleep)
    respx.get("https://x.test/").mock(return_value=httpx.Response(429))
    async with httpx.AsyncClient() as c:
        with pytest.raises(UpstreamError) as err:
            await request_json(c, "x", "GET", "https://x.test/", retries=1)
    assert err.value.kind == "rate_limited"


def test_parse_search_and_places():
    out = geocode.parse_search(
        [
            {
                "osm_type": "relation",
                "osm_id": 1,
                "display_name": "Lucknow, Uttar Pradesh, India",
                "lat": "26.8",
                "lon": "80.9",
                "boundingbox": ["26.7", "26.9", "80.8", "81.0"],
                "addresstype": "city",
            }
        ]
    )
    assert out[0]["bbox"] == {"west": 80.8, "south": 26.7, "east": 81.0, "north": 26.9}
    places = geocode.parse_places(
        {
            "elements": [
                {"id": 1, "lat": 1, "lon": 2, "tags": {"place": "suburb", "name": "Gomti Nagar"}},
                {"id": 2, "lat": 1, "lon": 2, "tags": {"tourism": "attraction", "name": "Bara Imambara"}},
                {"id": 3, "lat": 1, "lon": 2, "tags": {"highway": "traffic_signals"}},
            ]
        }
    )
    assert [p["kind"] for p in places] == ["locality", "landmark", "junction"]


def test_ai_settings_need_admin_token(client, monkeypatch):
    assert client.put("/api/settings/ai", json={"provider": "openai"}, headers={"X-Admin-Token": ""}).status_code == 403
    monkeypatch.setattr(settings, "admin_token", "secret")
    assert client.put("/api/settings/ai", json={"provider": "openai"}).status_code == 403
    assert (
        client.put("/api/settings/ai", json={"provider": "x"}, headers={"X-Admin-Token": "secret"}).status_code == 422
    )
    ok = client.put("/api/settings/ai", json={"provider": "gemini"}, headers={"X-Admin-Token": "secret"})
    assert ok.json()["selection"]["provider"] == "gemini"


def test_ai_not_configured(client):
    assert client.post("/api/ai/ask", json={"report_id": "x"}).status_code == 503


@respx.mock
def test_ai_ask_flags_invented_numbers(live, payload, monkeypatch):
    respx.get(f"{BASE}/flow").mock(return_value=httpx.Response(200, json=payload(speed=1)))
    respx.get(f"{BASE}/incidents").mock(return_value=httpx.Response(200, json={"results": []}))
    monkeypatch.setattr(settings, "ollama_url", "http://ollama.test")
    respx.post("http://ollama.test/api/chat").mock(
        return_value=httpx.Response(200, json={"message": {"content": "MG Road is at 3.6 km/h with 777 vehicles."}})
    )
    app.state.cache.mem["settings:ai"] = (float("inf"), '{"provider": "ollama", "model": null}')
    rep = live.post(
        "/api/report", json={"name": "L", "bbox": {"west": 80.8, "south": 26.7, "east": 81.0, "north": 26.9}}
    ).json()
    out = live.post("/api/ai/ask", json={"report_id": rep["id"]}).json()
    assert out["unverified_numbers"] == [777.0] and out["provider"] == "ollama"
    assert ai.is_ready({"provider": "ollama"})
