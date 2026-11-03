import type { Level } from "./types";

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

export const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} min ${Math.round(seconds % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const roadName = (name: string | null | undefined) => name || "Unnamed road";
export const providerName = (name: string) => ({ here: "HERE", tomtom: "TomTom" })[name] ?? name;
