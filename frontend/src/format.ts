import type { Brief, Level } from "./types";

export const LEVEL_COLOR: Record<Level, string> = {
  free: "#22c55e",
  moderate: "#facc15",
  heavy: "#f97316",
  severe: "#ef2b2b",
  unavailable: "#9ca3af",
};

export const LEVEL_LABEL: Record<Level, string> = {
  free: "Free flow",
  moderate: "Moderate",
  heavy: "Heavy",
  severe: "Severe",
  unavailable: "No live data",
};

const IST = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "n/a" : `${IST.format(d)} IST`;
}

const IST_CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

export const fmtClock = (ms: number) => `${IST_CLOCK.format(ms)} IST`;

export function fmtAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
}

export const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} min ${Math.round(seconds % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Rounded outward to fives: more digits would claim precision a modelled range does not have. */
export function fmtVehicleRange(low: number, high: number): string {
  const lo = Math.max(1, Math.floor(low / 5) * 5);
  const hi = Math.max(lo, Math.ceil(high / 5) * 5);
  return lo === hi ? `about ${lo}` : `${lo} to ${hi}`;
}

export function roadSpeeds(b: Brief, unit = ""): string {
  if (b.road_closed) return "CLOSED";
  return `${b.speed_kmh ?? "n/a"} / ${b.free_flow_speed_kmh ?? "n/a"}${unit}${b.part_closed ? ", part closed" : ""}`;
}

export const roadName = (name: string | null | undefined) => name || "Unnamed road";
export const providerName = (name: string) => ({ here: "HERE", tomtom: "TomTom" })[name] ?? name;
