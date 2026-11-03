import asyncio
import json
import logging
import time
from datetime import UTC, datetime

import redis.asyncio as redis

log = logging.getLogger("nakabandi.cache")
STALE_FACTOR = 12  # last-good copy outlives the fresh TTL, served only when the upstream fails


class Cache:
    """Redis when configured, otherwise an in-process dict. A Redis outage degrades to a cache miss."""

    def __init__(self, url: str = ""):
        self.redis = redis.from_url(url, decode_responses=True) if url else None
        self.mem: dict[str, tuple[float, str]] = {}
        self.locks: dict[str, asyncio.Lock] = {}

    async def get(self, key: str):
        try:
            if self.redis:
                raw = await self.redis.get(key)
            else:
                expires, raw = self.mem.get(key, (0, None))
                if expires < time.time():
                    raw = None
        except (redis.RedisError, OSError) as exc:
            log.warning("redis get failed: %s", exc)
            return None
        return json.loads(raw) if raw else None

    async def set_many(self, items: dict, ttl: int | None):
        if self.redis:
            try:
                async with self.redis.pipeline(transaction=False) as pipe:
                    for k, v in items.items():
                        pipe.set(k, json.dumps(v), ex=ttl)
                    await pipe.execute()
            except (redis.RedisError, OSError) as exc:
                log.warning("redis set failed: %s", exc)
            return
        now = time.time()
        if len(self.mem) > 50_000:
            self.mem = {k: v for k, v in self.mem.items() if v[0] > now}
        for k, v in items.items():
            self.mem[k] = (now + ttl if ttl else float("inf"), json.dumps(v))

    async def set(self, key: str, value, ttl: int | None):
        await self.set_many({key: value}, ttl)

    async def fetch(self, key: str, ttl: int, fn):
        """Returns (value, stale). One upstream call per key at a time; last-good served if fn raises."""
        hit = await self.get(key)
        if hit is not None:
            return hit, False
        async with self.locks.setdefault(key, asyncio.Lock()):
            hit = await self.get(key)
            if hit is not None:
                return hit, False
            try:
                value = await fn()
            except Exception:
                old = await self.get(f"stale:{key}")
                if old is None:
                    raise
                log.warning("serving stale value for %s", key)
                return old, True
            await self.set_many({key: value}, ttl)
            await self.set(f"stale:{key}", value, ttl * STALE_FACTOR)
            return value, False


def utcnow() -> datetime:
    return datetime.now(UTC)
