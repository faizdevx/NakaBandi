import type {
  AiAnswer,
  AiSettings,
  BBox,
  National,
  Place,
  Report,
  SearchResult,
  SegmentCollection,
  SegmentDetail,
  Status,
} from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "network", "Nakabandi API is not reachable.");
  }
  if (res.ok) return res.json();
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  throw new ApiError(res.status, detail?.code ?? "error", detail?.detail ?? `Request failed (HTTP ${res.status}).`);
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const bboxParam = (b: BBox) => [b.west, b.south, b.east, b.north].map((v) => v.toFixed(5)).join(",");

export const api = {
  status: () => call<Status>("/api/status"),
  national: () => call<National>("/api/traffic/national"),
  segments: (b: BBox, zoom: number, signal: AbortSignal) =>
    call<SegmentCollection>(`/api/traffic/segments?bbox=${bboxParam(b)}&zoom=${zoom.toFixed(1)}`, { signal }),
  segment: (id: string) => call<SegmentDetail>(`/api/traffic/segment/${encodeURIComponent(id)}`),
  segmentAt: (lat: number, lon: number, zoom: number) =>
    call<SegmentDetail>(`/api/traffic/at?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&zoom=${Math.round(zoom)}`),
  search: (q: string) =>
    call<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.results),
  // About 1 km: enough to find the city, and the exact spot never leaves the browser.
  locate: (lat: number, lon: number) => call<SearchResult>("/api/locate", post({ lat: +lat.toFixed(2), lon: +lon.toFixed(2) })),
  places: (b: BBox) => call<{ places: Place[] }>(`/api/places?bbox=${bboxParam(b)}`).then((r) => r.places),
  report: (name: string, bbox: BBox) => call<Report>("/api/report", post({ name, bbox })),
  ask: (body: { report_id?: string; segment_ids?: string[]; question?: string }) =>
    call<AiAnswer>("/api/ai/ask", post(body)),
  aiSettings: () => call<AiSettings>("/api/settings/ai"),
  saveAiSettings: (provider: string | null, model: string | null, token: string) =>
    call<AiSettings>("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({ provider, model }),
    }),
};
