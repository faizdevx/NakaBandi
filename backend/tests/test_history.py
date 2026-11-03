"""Runs against a real PostGIS when TEST_DATABASE_URL is set; skipped otherwise."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from app.history import History
from app.providers.here import normalize_flow

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
BOX = {"west": 80.8, "south": 26.7, "east": 81.0, "north": 26.9}


async def test_record_and_compare_same_hour_last_week(payload):
    history = History()
    await history.connect(URL)
    assert history.pool is not None
    await history.pool.execute("TRUNCATE traffic_observation, road_segment")
    now = datetime.now(UTC)

    assert (await history.compare(BOX))["available"] is False

    for week in (1, 2):
        for minute in range(12):
            when = now - timedelta(weeks=week)
            when = when.replace(minute=minute)
            raw = payload(speed=10, free=20) | {"sourceUpdated": when.isoformat()}
            batch = normalize_flow(raw, now)
            await history.record([r.model_dump(mode="json") for r in batch.records])

    result = await history.compare(BOX)
    assert result["available"] is True and result["samples"] == 24
    assert result["avg_speed_kmh"] == 36

    # Non-live observations must never enter the archive.
    raw = payload(confidence=0.4) | {"sourceUpdated": now.isoformat()}
    await history.record([r.model_dump(mode="json") for r in normalize_flow(raw, now).records])
    assert await history.pool.fetchval("SELECT count(*) FROM traffic_observation") == 24
    await history.close()
