import { describe, expect, it } from "vitest";
import type { SegmentCollection } from "../types";
import { buildTracks, particleFrame, pointAlong } from "./particles";

const road = (props: object): SegmentCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "a", name: null, level: "free", speed: 40, basis: "realtime", ...props },
      geometry: {
        type: "LineString",
        coordinates: [
          [80, 26],
          [80, 26.01],
          [80, 26.02],
        ],
      },
    },
  ],
});

describe("particles", () => {
  it("are built only for live measured roads", () => {
    expect(buildTracks(road({}))).toHaveLength(1);
    expect(buildTracks(road({ level: "unavailable" }))).toHaveLength(0);
    expect(buildTracks(road({ basis: "historical" }))).toHaveLength(0);
    expect(buildTracks(road({ speed: 0 }))).toHaveLength(0);
    expect(buildTracks(road({ speed: null }))).toHaveLength(0);
  });

  it("follow shape order, in the direction of travel", () => {
    const [t] = buildTracks(road({}));
    expect(pointAlong(t, 0)[1]).toBeCloseTo(26, 5);
    expect(pointAlong(t, t.length / 2)[1]).toBeCloseTo(26.01, 5);
    expect(pointAlong(t, t.length * 0.75)[1]).toBeGreaterThan(26.01);
  });

  it("wrap around the road and advance with time", () => {
    const [t] = buildTracks(road({}));
    expect(pointAlong(t, t.length + 0.1)[1]).toBeCloseTo(pointAlong(t, 0.1)[1], 6);
    const a = particleFrame([t], 0).features[0].geometry as GeoJSON.Point;
    const b = particleFrame([t], 1).features[0].geometry as GeoJSON.Point;
    expect(b.coordinates[1]).toBeGreaterThan(a.coordinates[1]);
  });
});
