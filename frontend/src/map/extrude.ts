// Column height is a visual scale for severity (set in MapView), not a measurement or a vehicle count.
// Half-width in degrees for the country view and the district view.
const COLUMN_RADIUS_DEG = [0.22, 0.045];
const MIN_COLUMN_SEVERITY = 0.15;

const lonScale = (lat: number) => 1 / Math.max(Math.cos((lat * Math.PI) / 180), 0.1);

function polygon(ring: number[][], properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature {
  return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } };
}

export function hotspotColumns(hotspots: { id: string; lon: number; lat: number; severity: number }[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hotspots.flatMap((h) =>
      COLUMN_RADIUS_DEG.map((r, tier) => {
        const dx = r * lonScale(h.lat);
        return polygon(
          [
            [h.lon - dx, h.lat - r],
            [h.lon + dx, h.lat - r],
            [h.lon + dx, h.lat + r],
            [h.lon - dx, h.lat + r],
          ],
          { id: h.id, lon: h.lon, lat: h.lat, tier, severity: Math.max(h.severity, MIN_COLUMN_SEVERITY) },
        );
      }),
    ),
  };
}
