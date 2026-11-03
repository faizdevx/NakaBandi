import { expect, it } from "vitest";
import { hotspotColumns } from "./extrude";

it("hotspotColumns closes each ring at both widths and keeps zero severity visible", () => {
  const [wide, narrow] = hotspotColumns([{ id: "a", lon: 80, lat: 25, severity: 0 }]).features;
  const ring = (wide.geometry as GeoJSON.Polygon).coordinates[0];
  expect(ring[0]).toEqual(ring[ring.length - 1]);
  expect(wide.properties!.tier).toBe(0);
  expect(narrow.properties!.tier).toBe(1);
  expect(wide.properties!.severity).toBeGreaterThan(0);
});
