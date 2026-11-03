import type { SegmentCollection } from "../types";

const KM_PER_DEG_LAT = 111.19;
const SPACING_KM = 0.35;
const MAX_PARTICLES = 1500;
// Display speed, not real time: 40 km/h moves 0.1 km per second on screen.
const TIME_SCALE = 0.1 / 40;

export type Track = { line: number[][]; cum: number[]; length: number; rate: number; offsets: number[] };

function dist(a: number[], b: number[]): number {
  const dy = (b[1] - a[1]) * KM_PER_DEG_LAT;
  const dx = (b[0] - a[0]) * KM_PER_DEG_LAT * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Only roads with a live measured speed get particles; direction is provider shape order. */
export function buildTracks(fc: SegmentCollection): Track[] {
  const tracks: Track[] = [];
  let total = 0;
  for (const f of fc.features) {
    const { level, basis, speed } = f.properties;
    if (level === "unavailable" || basis !== "realtime" || !speed || speed <= 0) continue;
    const line = f.geometry.coordinates;
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
    const length = cum[cum.length - 1];
    if (length <= 0) continue;
    const n = Math.max(1, Math.floor(length / SPACING_KM));
    if (total + n > MAX_PARTICLES) break;
    total += n;
    tracks.push({
      line,
      cum,
      length,
      rate: speed * TIME_SCALE,
      offsets: Array.from({ length: n }, (_, i) => (i / n) * length),
    });
  }
  return tracks;
}

export function pointAlong(t: Track, d: number): number[] {
  const at = ((d % t.length) + t.length) % t.length;
  let i = 1;
  while (i < t.cum.length - 1 && t.cum[i] < at) i++;
  const seg = t.cum[i] - t.cum[i - 1];
  const f = seg > 0 ? (at - t.cum[i - 1]) / seg : 0;
  return [
    t.line[i - 1][0] + (t.line[i][0] - t.line[i - 1][0]) * f,
    t.line[i - 1][1] + (t.line[i][1] - t.line[i - 1][1]) * f,
  ];
}

export function particleFrame(tracks: Track[], seconds: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const t of tracks) {
    for (const off of t.offsets) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: pointAlong(t, off + seconds * t.rate) },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
