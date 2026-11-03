import pytest


def here_payload(speed=5.0, free=10.0, confidence=0.9, traversability="open", name="MG Road"):
    return {
        "sourceUpdated": "2026-11-03T04:00:00Z",
        "results": [
            {
                "location": {
                    "description": name,
                    "length": 2000.0,
                    "shape": {
                        "links": [
                            {
                                "functionalClass": 2,
                                "length": 1000.0,
                                "points": [{"lat": 26.80, "lng": 80.90}, {"lat": 26.81, "lng": 80.90}],
                            },
                            {
                                "functionalClass": 3,
                                "length": 1000.0,
                                "points": [{"lat": 26.81, "lng": 80.90}, {"lat": 26.82, "lng": 80.90}],
                            },
                        ]
                    },
                },
                "currentFlow": {
                    "speed": speed,
                    "freeFlow": free,
                    "jamFactor": 5.0,
                    "confidence": confidence,
                    "traversability": traversability,
                },
            }
        ],
    }


@pytest.fixture
def payload():
    return here_payload
