export type Level = "free" | "moderate" | "heavy" | "severe" | "unavailable";
export type BBox = { west: number; south: number; east: number; north: number };

export type ProviderMeta = { name: string; attribution: string; capabilities: Record<string, boolean> };

export type Status = {
  provider: ProviderMeta | null;
  ai_ready: boolean;
  history_enabled: boolean;
  time: string;
};

export type Summary = {
  segments: number;
  total_km: number;
  measured_km: number;
  km_by_level: Record<Level, number>;
  coverage: number;
  avg_speed_kmh: number | null;
  avg_free_flow_kmh: number | null;
  speed_ratio: number | null;
  overall: Level;
};

export type Brief = {
  id: string;
  road_name: string | null;
  road_class: string | null;
  direction: string | null;
  length_km: number;
  speed_kmh: number | null;
  free_flow_speed_kmh: number | null;
  congestion_level: Level;
  delay_seconds: number | null;
  road_closed: boolean;
  part_closed: boolean;
  confidence: number | null;
  severity: number;
  modelled_status: Modelled["status"] | null;
  modelled_vehicles_low: number | null;
  modelled_vehicles_high: number | null;
  lon: number;
  lat: number;
  city?: string;
};

export type National = {
  provider: ProviderMeta;
  retrieved_at: string | null;
  observed_at: string | null;
  stale: boolean;
  probes_total: number;
  probes_ok: number;
  km_by_level: Record<Level, number>;
  total_km: number;
  coverage: number;
  cities: { name: string; lat: number; lon: number; error: string | null; summary: Summary | null }[];
  most_congested: ({ name: string } & Summary)[];
  hotspots: Brief[];
};

export type SegmentProps = { id: string; name: string | null; level: Level; speed: number | null; basis: string };
export type SegmentCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, SegmentProps> & {
  meta?: {
    provider: string;
    attribution: string;
    retrieved_at: string | null;
    observed_at: string | null;
    stale: boolean;
    summary: Summary;
  };
};

export type Incident = {
  id: string;
  provider: string;
  type: string | null;
  criticality: string | null;
  road_closed: boolean;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
};

export type Estimate = {
  status: "ok" | "unreliable" | "unavailable";
  estimated_density: number | null;
  estimated_vehicle_count: number | null;
  count_low: number | null;
  count_high: number | null;
  estimate_method: string;
  uncertainty: number | null;
  notes: string[];
  calculated_at: string;
};

export type Modelled = {
  status: "ok" | "light" | "unavailable";
  density_low: number | null;
  density_high: number | null;
  count_low: number | null;
  count_high: number | null;
  lanes_low: number | null;
  lanes_high: number | null;
  lanes_source: "openstreetmap" | "assumed_from_road_class" | null;
  notes: string[];
};

export type SegmentDetail = {
  segment: {
    id: string;
    road_name: string | null;
    road_class: string | null;
    length_km: number;
    direction: string | null;
    geometry: number[][];
  };
  observation: {
    provider: string;
    observed_at: string | null;
    retrieved_at: string;
    speed_kmh: number | null;
    free_flow_speed_kmh: number | null;
    flow_vehicles_per_hour: number | null;
    congestion_level: Level;
    travel_time_seconds: number | null;
    incident_status: string | null;
    confidence: number | null;
    data_basis: string;
  };
  estimate: Estimate;
  modelled: Modelled | null;
  delay_seconds: number | null;
  incidents: Incident[];
  incidents_error: string | null;
  provider: ProviderMeta;
};

export type Report = {
  id: string;
  area: string;
  overall: Summary;
  hotspots: Brief[];
  most_affected: Brief[];
  density_and_counts: {
    available: boolean;
    estimates: Estimate[];
    reason: string | null;
    modelled: { count_low: number; count_high: number; roads: number; light_roads: number; unavailable_roads: number };
  };
  incidents: Incident[];
  incident_count: number;
  incidents_available: boolean;
  insufficient_data: { unmeasured_km: number; roads: { road_name: string; km: number }[] };
  history: { available: boolean; reason?: string; samples?: number; avg_speed_kmh?: number };
  recommendations: string[];
  provenance: {
    generated_at: string;
    retrieved_at: string;
    providers: string[];
    attribution: string;
    bbox: BBox;
    stale: boolean;
    limitations: string[];
  };
};

export type SearchResult = {
  id: string;
  name: string;
  display_name: string;
  kind: string | null;
  category: string | null;
  lat: number;
  lon: number;
  bbox: BBox;
  geojson: GeoJSON.Geometry | null;
};

export type Place = { id: number; kind: "locality" | "landmark" | "junction"; name: string | null; lat: number; lon: number };

export type AiSettings = {
  selection: { provider: string | null; model?: string | null } | null;
  providers: { id: string; configured: boolean; default_model: string }[];
  admin_enabled: boolean;
};

export type AiAnswer = { text: string; provider: string; model: string; unverified_numbers: number[] };

export type Toggles = {
  hybrid: boolean;
  traffic: boolean;
  roads: boolean;
  hotspots: boolean;
  threeD: boolean;
  particles: boolean;
};
