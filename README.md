# NAKABANDI

Camera-free traffic intelligence for India. A satellite map, measured road speeds from a traffic API, deterministic analytics, and reports that state where their numbers came from and what is missing.

Nakabandi shows no sample data. Without a provider key it says so, and the map and search keep working.

## Run it

Get a free [TomTom](https://developer.tomtom.com) API key (no card), then:

```bash
cp .env.example .env   # set TOMTOM_API_KEY in .env, never in .env.example
docker compose up --build
```

Open http://localhost:8080.

Without Docker:

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -e ".[dev]" && .venv/Scripts/uvicorn app.main:app --port 8000
cd frontend && npm install && npm run dev
```

Open http://localhost:5173.

## What each number means

| Item | Source |
|---|---|
| Road colours on the map | TomTom traffic tiles, using TomTom's own colour scale |
| Speed, free-flow speed, travel times, confidence | TomTom Flow Segment Data |
| Congestion level in panels | `speed / free-flow`: at least 0.75 free, 0.5 moderate, 0.25 heavy, below that severe |
| "No live data" | Confidence below 0.7. TomTom documents confidence only as 0 to 1 quality, so this cut-off is Nakabandi's choice |
| Incidents | TomTom Incident Details |
| Road names | OpenStreetMap, looked up at the road midpoint, because TomTom returns none. May name a nearby road or find none |
| Vehicle estimate | `N = q × L / v`, only when the provider reports flow `q` |
| AI text | Interpretation of computed figures. Numbers not found in the evidence are flagged in the UI |

City reports and the national overview are grid samples, because TomTom answers one point per call. They cover some roads, not all, and say so. The simulated flow dots stay hidden with TomTom because it does not document coordinate order as travel direction.

### Vehicle counts are currently unavailable

The HERE and TomTom flow documentation lists no traffic-volume field, so `flow_vehicles_per_hour` stays empty and the panel shows "Cannot estimate". Speed alone cannot give a count, and Nakabandi does not guess one. The engine in `backend/app/estimation.py` is implemented and tested, and starts working as soon as a provider supplies flow.

## Provider review

Checked against public documentation in November 2026. TomTom was also tested live for India (Lucknow, Delhi, Bengaluru, Chandigarh).

| | TomTom (in use) | HERE Traffic v7 (adapter included) | Mappls |
|---|---|---|---|
| India live flow | Listed in coverage, confirmed live | Coverage page lists India | Marketed, no public coverage detail |
| Current speed | Yes | Yes | Marketed |
| Volume (veh/h) | Not documented | Not documented | Not found |
| Area request | Single point per call | Bounding box up to 1° × 1° | Not found |
| Road names | No | Not confirmed in docs | Not found |
| Free tier | 20K flow, 200K tiles, 2.5K incidents per month, no card | No free tier confirmed | No public figures |
| Attribution and storage terms | Tiles sent as no-store. Terms not fully reviewed | Not verified | Not verified |

Read the provider's terms before commercial use, and before turning on the archive. TomTom is used when both keys are set.

To add a provider, implement `TrafficProvider` in `backend/app/providers/base.py` and normalize into `backend/app/schemas.py`.

## Other services

| Service | Use | Terms to respect |
|---|---|---|
| Esri World Imagery | Satellite tiles | Sources disagree on licence: check Esri's terms before commercial use |
| OpenFreeMap | Roads, boundaries, labels (OSM data) | Attribution required |
| Nominatim | Search | 1 request per second, no autocomplete, so search runs on Enter |
| Overpass | Localities, landmarks, signals | Shared and often slow. Commercial use should self-host: set `OVERPASS_URL` |

Boundaries come from OpenStreetMap and are not an official Survey of India depiction. Review this before any public release in India.

## Staying on the free tier

| Action | TomTom calls | Cached |
|---|---|---|
| National overview | 48 flow (12 cities × 4 points) | 3 hours |
| City report | 25 flow + 1 incident | 15 minutes |
| Clicking a road | 1 flow + 1 incident | 15 minutes |
| Map traffic layer | 1 tile per tile shown | Not cached, TomTom sends no-store |

The API stops calling TomTom for the day at 600 flow, 6000 tile and 75 incident calls (`FLOW_DAILY_BUDGET`, `TILE_DAILY_BUDGET`, `INCIDENT_DAILY_BUDGET`), then serves the last good data marked STALE where it has one. These counters are per process and reset on restart.

## History

Off by default, because provider storage terms are unverified. To enable: set `DATABASE_URL` and run `docker compose --profile history up`. Reports then compare with the same weekday and hour over the past 28 days, after 20 archived samples.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest && .venv/Scripts/ruff check app tests
cd frontend && npm run lint && npm test && npm run build
```

Browser test, using the real app with a fixture traffic provider that exists only in `backend/tests`:

```bash
cd backend && .venv/Scripts/python -m tests.e2e_server
cd frontend && npm run dev
cd frontend && npm run e2e
```

`frontend/e2e/live-check.mjs` runs the same flow against the real provider and spends real quota.

## Theme photo

To show your motorcycle photo on the start screen and in Settings, save it as `frontend/public/theme/ride.jpg`. This folder is git-ignored, so check you have the rights before committing a photo.
