import math
from itertools import pairwise

from .schemas import BBox

INDIA = BBox(west=66.0, south=6.0, east=99.0, north=38.0)
COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def haversine_km(a: list[float], b: list[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def line_length_km(line: list[list[float]]) -> float:
    return sum(haversine_km(a, b) for a, b in pairwise(line))


def compass(line: list[list[float]]) -> str | None:
    """Overall heading from first to last vertex."""
    if len(line) < 2 or line[0] == line[-1]:
        return None
    lat1, lat2 = math.radians(line[0][1]), math.radians(line[-1][1])
    dlon = math.radians(line[-1][0] - line[0][0])
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return COMPASS[round((math.degrees(math.atan2(y, x)) % 360) / 45) % 8]


def midpoint(line: list[list[float]]) -> list[float]:
    """Point halfway along the line, by distance."""
    remaining = line_length_km(line) / 2
    for a, b in pairwise(line):
        step = haversine_km(a, b)
        if step >= remaining and step > 0:
            t = remaining / step
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        remaining -= step
    return line[0]


def valid_india_bbox(b: BBox) -> bool:
    return (
        b.west < b.east
        and b.south < b.north
        and b.west >= INDIA.west
        and b.east <= INDIA.east
        and b.south >= INDIA.south
        and b.north <= INDIA.north
    )


def grid_cells(b: BBox, size: float) -> list[tuple[int, int]]:
    """Snapped grid cells covering b, so panning reuses cached provider responses."""
    x0, x1 = math.floor(b.west / size), math.ceil(b.east / size)
    y0, y1 = math.floor(b.south / size), math.ceil(b.north / size)
    return [(x, y) for x in range(x0, x1) for y in range(y0, y1)]


def cell_bbox(cell: tuple[int, int], size: float) -> BBox:
    x, y = cell
    return BBox(west=x * size, south=y * size, east=(x + 1) * size, north=(y + 1) * size)


def clamp_bbox(b: BBox, max_side: float, min_side: float = 0.02) -> tuple[BBox, bool]:
    """Keep the centre, limit each side. Returns (bbox, whether the area was clipped)."""
    cx, cy = (b.west + b.east) / 2, (b.south + b.north) / 2
    w = max(min_side, b.east - b.west)
    h = max(min_side, b.north - b.south)
    clipped = w > max_side or h > max_side
    w, h = min(w, max_side), min(h, max_side)
    return BBox(west=cx - w / 2, south=cy - h / 2, east=cx + w / 2, north=cy + h / 2), clipped
