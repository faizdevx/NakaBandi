# NAKABANDI

Camera-free traffic intelligence for India. A satellite map, measured road speeds from a traffic API, deterministic analytics, and reports that state where their numbers came from and what is missing.

Nakabandi shows no sample data. Without a provider key it says so, and the map and search keep working.

## Run it

Get a [HERE](https://platform.here.com) API key, then:

```bash
cp .env.example .env   # set HERE_API_KEY
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
| Speed, free-flow speed, confidence | HERE Traffic API v7 |
| Congestion colour | `speed / free-flow`: at least 0.75 free, 0.5 moderate, 0.25 heavy, below that severe |
| Grey road | HERE confidence at or below 0.7, which HERE documents as historical or speed-limit data, not live |
| Travel-time delay | Derived from length and speeds |
| Vehicle estimate | `N = q × L / v`, only when the provider reports flow `q` |
| AI text | Interpretation of computed figures. Numbers not found in the evidence are flagged in the UI |

### Vehicle counts are currently unavailable

The HERE and TomTom flow documentation lists no traffic-volume field, so `flow_vehicles_per_hour` stays empty and the panel shows "Cannot estimate". Speed alone cannot give a count, and Nakabandi does not guess one. The engine in `backend/app/estimation.py` is implemented and tested, and starts working as soon as a provider supplies flow.

## Provider review

Checked against public documentation, November 2026. Nothing here has been confirmed with a live key yet.

| | HERE Traffic v7 | TomTom Flow Segment | Mappls |
|---|---|---|---|
| India live flow | Coverage page lists India North, Central, South | Not stated on the flow pages | Marketed, no public coverage detail |
| Current speed | Yes | Yes | Marketed |
| Volume (veh/h) | Not documented | Not documented | Not found |
| Area request | Bounding box up to 1° × 1° | Single point per call | Not found |
| Road names | Not confirmed in docs, treated as optional | No | Not found |
| Free tier | Not shown on pricing page | 20K calls per month, no card | No public figures |
| Attribution and storage terms | Not verified | Not verified | Not verified |

HERE came first because one bounding-box call returns a whole city, where TomTom needs one call per road. Read the provider's terms before commercial use, and before turning on the archive.

To add a provider, implement `TrafficProvider` in `backend/app/providers/base.py` and normalize into `backend/app/schemas.py`.

## Other services

| Service | Use | Terms to respect |
|---|---|---|
| Esri World Imagery | Satellite tiles | Sources disagree on licence: check Esri's terms before commercial use |
| OpenFreeMap | Roads, boundaries, labels (OSM data) | Attribution required |
| Nominatim | Search | 1 request per second, no autocomplete, so search runs on Enter |
| Overpass | Localities, landmarks, signals | Shared and often slow. Commercial use should self-host: set `OVERPASS_URL` |

Boundaries come from OpenStreetMap and are not an official Survey of India depiction. Review this before any public release in India.

## Provider request budget

- National overview: 24 city samples, one call each, cached 30 minutes (`NATIONAL_TTL_SECONDS`). It is a sample of cities, not all of India.
- Map at city zoom: up to 16 grid cells per view, cached 5 minutes (`FLOW_TTL_SECONDS`).
- When the provider fails, the last good data is served and marked STALE.

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

## Theme photo

To show your motorcycle photo on the start screen and in Settings, save it as `frontend/public/theme/ride.jpg`. This folder is git-ignored, so check you have the rights before committing a photo.
