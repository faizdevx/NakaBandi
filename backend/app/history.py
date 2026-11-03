"""Optional observation archive in PostGIS. Off unless DATABASE_URL is set."""

import logging
from datetime import datetime
from pathlib import Path

import asyncpg

log = logging.getLogger("nakabandi.history")
SCHEMA = Path(__file__).with_name("schema.sql")
OFF = {"available": False, "reason": "Historical archive is off: no comparison available."}
MIN_SAMPLES = 20


class History:
    def __init__(self):
        self.pool = None

    async def connect(self, url: str):
        if not url:
            return
        try:
            self.pool = await asyncpg.create_pool(url, min_size=1, max_size=4)
            async with self.pool.acquire() as con:
                await con.execute(SCHEMA.read_text())
        except (OSError, asyncpg.PostgresError) as exc:
            log.error("history disabled, database unavailable: %s", exc)
            self.pool = None

    async def close(self):
        if self.pool:
            await self.pool.close()

    async def record(self, records: list[dict]):
        """Archive failures never break a live request."""
        if not self.pool or not records:
            return
        seg_rows, obs_rows = [], []
        for r in records:
            s, o = r["segment"], r["observation"]
            wkt = "LINESTRING(" + ",".join(f"{x} {y}" for x, y in s["geometry"]) + ")"
            seg_rows.append((s["id"], s["road_name"], s["road_class"], s["length_km"], s["direction"], wkt))
            if o["data_basis"] == "realtime" and o["speed_kmh"] is not None:
                # Not every provider timestamps its data; retrieval time is then the best known time.
                observed = datetime.fromisoformat(o["observed_at"] or o["retrieved_at"])
                obs_rows.append(
                    (s["id"], o["provider"], observed, o["speed_kmh"], o["free_flow_speed_kmh"], o["confidence"])
                )
        try:
            async with self.pool.acquire() as con, con.transaction():
                await con.executemany(
                    "INSERT INTO road_segment (id, road_name, road_class, length_km, direction, geom) "
                    "VALUES ($1,$2,$3,$4,$5,ST_GeomFromText($6,4326)) ON CONFLICT (id) DO NOTHING",
                    seg_rows,
                )
                await con.executemany(
                    "INSERT INTO traffic_observation (segment_id, provider, observed_at, speed_kmh, "
                    "free_flow_speed_kmh, confidence) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
                    obs_rows,
                )
        except (OSError, asyncpg.PostgresError) as exc:
            log.warning("history write failed: %s", exc)

    async def compare(self, bbox: dict) -> dict:
        """Same weekday and hour across the previous 28 days, inside bbox."""
        if not self.pool:
            return OFF
        query = """
            SELECT count(*) AS n, sum(s.length_km) / nullif(sum(s.length_km / nullif(o.speed_kmh, 0)), 0) AS speed
            FROM traffic_observation o JOIN road_segment s ON s.id = o.segment_id
            WHERE s.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
              AND o.observed_at > now() - interval '28 days'
              AND o.observed_at < now() - interval '1 day'
              AND extract(dow FROM o.observed_at) = extract(dow FROM now())
              AND extract(hour FROM o.observed_at) = extract(hour FROM now())
        """
        try:
            row = await self.pool.fetchrow(query, bbox["west"], bbox["south"], bbox["east"], bbox["north"])
        except (OSError, asyncpg.PostgresError) as exc:
            log.warning("history read failed: %s", exc)
            return {"available": False, "reason": "Historical archive could not be read."}
        if row["n"] < MIN_SAMPLES or row["speed"] is None:
            return {"available": False, "reason": f"Too few archived samples for this hour ({row['n']})."}
        return {"available": True, "samples": row["n"], "avg_speed_kmh": round(float(row["speed"]), 1)}
