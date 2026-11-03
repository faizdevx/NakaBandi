"""All traffic statistics. Deterministic: AI text may only interpret what is computed here."""

from .geo import midpoint

LEVELS = ("free", "moderate", "heavy", "severe", "unavailable")


def classify(speed: float | None, free: float | None, basis: str, closed: bool = False) -> str:
    """Only live measurements get a colour; historical or speed-limit fallbacks read as unavailable."""
    if closed and basis == "realtime":
        return "severe"
    if basis != "realtime" or speed is None or not free or speed < 0:
        return "unavailable"
    ratio = speed / free
    if ratio >= 0.75:
        return "free"
    if ratio >= 0.5:
        return "moderate"
    if ratio >= 0.25:
        return "heavy"
    return "severe"


def travel_time_seconds(length_km: float, speed_kmh: float | None) -> float | None:
    return length_km / speed_kmh * 3600 if speed_kmh and speed_kmh > 0 else None


def delay_seconds(obs: dict) -> float | None:
    t, ff = obs.get("travel_time_seconds"), obs.get("free_flow_travel_time_seconds")
    return max(0.0, t - ff) if t is not None and ff is not None else None


def is_measured(rec: dict) -> bool:
    return rec["observation"]["congestion_level"] != "unavailable"


def summarize(records: list[dict]) -> dict:
    """Length-weighted distribution and speed index over a set of records."""
    km = dict.fromkeys(LEVELS, 0.0)
    measured_km = speed_time = ff_time = 0.0
    for r in records:
        length = r["segment"]["length_km"]
        obs = r["observation"]
        km[obs["congestion_level"]] += length
        if is_measured(r) and obs["speed_kmh"] and obs["free_flow_speed_kmh"]:
            measured_km += length
            speed_time += length / obs["speed_kmh"]
            ff_time += length / obs["free_flow_speed_kmh"]
    total = sum(km.values())
    live = total - km["unavailable"]
    avg_speed = measured_km / speed_time if speed_time else None
    avg_free = measured_km / ff_time if ff_time else None
    ratio = avg_speed / avg_free if avg_speed and avg_free else None
    return {
        "segments": len(records),
        "total_km": round(total, 2),
        "measured_km": round(live, 2),
        "km_by_level": {k: round(v, 2) for k, v in km.items()},
        "coverage": round(live / total, 3) if total else 0.0,
        "avg_speed_kmh": round(avg_speed, 1) if avg_speed else None,
        "avg_free_flow_kmh": round(avg_free, 1) if avg_free else None,
        "speed_ratio": round(ratio, 3) if ratio else None,
        "overall": classify(ratio, 1.0, "realtime") if ratio else "unavailable",
    }


def severity(rec: dict) -> float:
    obs = rec["observation"]
    if obs["incident_status"] == "closed":
        return 1.0
    if obs["speed_kmh"] is None or not obs["free_flow_speed_kmh"]:
        return 0.0
    return max(0.0, 1 - obs["speed_kmh"] / obs["free_flow_speed_kmh"])


def worst_segments(records: list[dict], limit: int = 10, min_km: float = 0.2) -> list[dict]:
    """Measured segments only, worst speed ratio first. Short stubs dropped: one signal is not a hotspot."""
    measured = [r for r in records if is_measured(r) and r["segment"]["length_km"] >= min_km]
    measured.sort(key=lambda r: (severity(r), r["segment"]["length_km"]), reverse=True)
    return [segment_brief(r) for r in measured[:limit]]


def segment_brief(r: dict) -> dict:
    seg, obs = r["segment"], r["observation"]
    delay = delay_seconds(obs)
    lon, lat = midpoint(seg["geometry"])
    modelled = r.get("modelled") or {}
    return {
        "id": seg["id"],
        "road_name": seg["road_name"],
        "road_class": seg["road_class"],
        "direction": seg["direction"],
        "length_km": round(seg["length_km"], 2),
        "speed_kmh": round(obs["speed_kmh"], 1) if obs["speed_kmh"] is not None else None,
        "free_flow_speed_kmh": round(obs["free_flow_speed_kmh"], 1) if obs["free_flow_speed_kmh"] else None,
        "congestion_level": obs["congestion_level"],
        "delay_seconds": round(delay) if delay is not None else None,
        "confidence": obs["confidence"],
        "severity": round(severity(r), 3),
        "modelled_status": modelled.get("status"),
        "modelled_vehicles_low": round(modelled["count_low"]) if modelled.get("count_low") is not None else None,
        "modelled_vehicles_high": round(modelled["count_high"]) if modelled.get("count_high") is not None else None,
        "lon": lon,
        "lat": lat,
    }


def dedupe(records: list[dict]) -> list[dict]:
    return list({r["segment"]["id"]: r for r in records}.values())


def recommendations(summary: dict, worst: list[dict], incidents: list[dict]) -> list[str]:
    """Rule-based. Each line quotes the observation that triggered it."""
    out = []
    for w in [w for w in worst if w["congestion_level"] in ("severe", "heavy")][:3]:
        if w["speed_kmh"] is None or w["free_flow_speed_kmh"] is None:
            continue
        name = w["road_name"] or "Unnamed segment"
        out.append(
            f"Prefer alternatives to {name} ({w['direction'] or 'direction n/a'}): "
            f"{w['speed_kmh']} km/h against {w['free_flow_speed_kmh']} km/h free-flow."
        )
    closed = [i for i in incidents if i.get("road_closed")]
    if closed:
        out.append(f"{len(closed)} reported road closure(s) in the area: check the incident list before routing.")
    if summary["total_km"] and summary["coverage"] < 0.3:
        out.append(
            f"Live coverage is {round(summary['coverage'] * 100)}% of returned road length: "
            "treat area-wide conclusions as weak."
        )
    return out


def summarize_modelled(records: list[dict]) -> dict:
    """Sum over the returned roads only, so it is never a total for the whole area."""
    rows = [r["modelled"] for r in records if r.get("modelled")]
    ok = [m for m in rows if m["status"] == "ok"]
    return {
        "count_low": round(sum(m["count_low"] for m in ok)),
        "count_high": round(sum(m["count_high"] for m in ok)),
        "roads": len(ok),
        "light_roads": sum(m["status"] == "light" for m in rows),
        "unavailable_roads": sum(m["status"] == "unavailable" for m in rows),
    }


def build_report(
    area: str,
    bbox: dict,
    clipped: bool,
    records: list[dict],
    incidents: list[dict],
    history: dict,
    provider: dict,
    retrieved_at: str,
    generated_at: str,
    stale: bool,
    incidents_available: bool = True,
) -> dict:
    summary = summarize(records)
    worst = worst_segments(records)
    hotspots = [w for w in worst if w["congestion_level"] == "severe"]
    unmeasured: dict[str, float] = {}
    for r in records:
        if not is_measured(r):
            name = r["segment"]["road_name"] or "Unnamed roads"
            unmeasured[name] = unmeasured.get(name, 0.0) + r["segment"]["length_km"]
    gaps = sorted(unmeasured.items(), key=lambda kv: kv[1], reverse=True)[:8]
    estimates = [r["estimate"] for r in records if r["estimate"]["status"] != "unavailable"]

    limitations = []
    if not provider["capabilities"].get("traffic_volume"):
        limitations.append(
            f"{provider['name']} does not report traffic volume, so no vehicle count here is measured. "
            "Ranges are modelled from speed with assumed jam density and lanes, and are not validated."
        )
    if clipped:
        limitations.append("Area exceeds one provider request: report covers the central 1° × 1° only.")
    limitations.append("Area is the bounding box of the selected place, not its exact boundary.")
    if stale:
        limitations.append("Provider was unreachable: figures are the last good retrieval.")
    if not history["available"]:
        limitations.append(history["reason"])
    if not incidents_available:
        limitations.append("Incident lookup failed: incidents may exist that are not listed here.")
    if not provider["capabilities"].get("bbox_flow", True):
        limitations.append(
            f"{provider['name']} answers one point per request: figures come from a grid sample of nearby "
            "roads, not every road in the area."
        )
    if not provider["capabilities"].get("road_names", True):
        limitations.append("Road names come from OpenStreetMap at the road midpoint and may name a nearby road.")

    return {
        "area": area,
        "overall": summary,
        "hotspots": hotspots,
        "most_affected": worst,
        "density_and_counts": {
            "available": bool(estimates),
            "estimates": estimates[:20],
            "reason": None if estimates else "No segment has both a measured flow and a speed.",
            "modelled": summarize_modelled(records),
        },
        "incidents": incidents[:30],
        "incident_count": len(incidents),
        "incidents_available": incidents_available,
        "insufficient_data": {
            "unmeasured_km": summary["km_by_level"]["unavailable"],
            "roads": [{"road_name": n, "km": round(k, 2)} for n, k in gaps],
        },
        "history": history,
        "recommendations": recommendations(summary, worst, incidents),
        "provenance": {
            "generated_at": generated_at,
            "retrieved_at": retrieved_at,
            "providers": [provider["name"]],
            "attribution": provider["attribution"],
            "bbox": bbox,
            "stale": stale,
            "limitations": limitations,
        },
    }
