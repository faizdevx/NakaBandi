"""Test-only API for frontend/e2e: the real app and normalizer, with a fixture traffic provider. Never deployed.

Run from backend/: python -m tests.e2e_server
"""

import random

import uvicorn

import app.main as m
from app.cache import utcnow
from app.providers.here import HereProvider, normalize_flow


class FixtureProvider(HereProvider):
    # Fixture lines are random diagonals, they do not follow roads. Must never read as real traffic.
    attribution = "FIXTURE TEST DATA, NOT REAL TRAFFIC"

    def __init__(self, client):
        super().__init__(client, "fixture")

    async def flow(self, bbox, max_functional_class):
        r = random.Random(f"{bbox.west:.3f}{bbox.south:.3f}")
        results = []
        for i in range(14):
            lat = bbox.south + (bbox.north - bbox.south) * (i + 0.5) / 14
            lon = bbox.west + (bbox.east - bbox.west) * r.random()
            points = [{"lat": lat + j * 0.004 * (1 if i % 2 else -1), "lng": lon + j * 0.006} for j in range(5)]
            free = r.choice([12, 16, 22])
            results.append(
                {
                    "location": {
                        "description": f"Fixture Road {i}",
                        "length": 2600,
                        "shape": {"links": [{"points": points, "functionalClass": 1 + i % 3}]},
                    },
                    "currentFlow": {
                        "speed": free * r.choice([0.9, 0.6, 0.35, 0.15]),
                        "freeFlow": free,
                        "jamFactor": 4,
                        "confidence": r.choice([0.95, 0.9, 0.85, 0.6]),
                        "traversability": "open",
                    },
                }
            )
        return normalize_flow({"sourceUpdated": utcnow().isoformat(), "results": results}, utcnow())

    async def incidents(self, bbox):
        return []


if __name__ == "__main__":
    m.build_provider = FixtureProvider
    uvicorn.run(m.app, port=8000, log_level="warning")
