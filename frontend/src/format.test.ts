import { describe, expect, it } from "vitest";
import { fmtAgo, fmtClock, roadSpeeds } from "./format";
import type { Brief } from "./types";

describe("fmtAgo", () => {
  it("moves from seconds to minutes to hours", () => {
    expect(fmtAgo(12.9)).toBe("12s ago");
    expect(fmtAgo(125)).toBe("2 min ago");
    expect(fmtAgo(7200)).toBe("2 h ago");
  });

  it("never shows a negative age when clocks disagree", () => {
    expect(fmtAgo(-3)).toBe("0s ago");
  });
});

describe("roadSpeeds", () => {
  const road = { speed_kmh: 16, free_flow_speed_kmh: 28, road_closed: false, part_closed: false } as Brief;

  it("keeps the measured speed when only part of a road is closed", () => {
    expect(roadSpeeds(road)).toBe("16 / 28");
    expect(roadSpeeds({ ...road, part_closed: true }, " km/h")).toBe("16 / 28 km/h, part closed");
  });

  it("says closed when no traffic moves", () => {
    expect(roadSpeeds({ ...road, road_closed: true })).toBe("CLOSED");
  });
});

it("fmtClock shows India time with seconds", () => {
  expect(fmtClock(Date.UTC(2026, 10, 3, 8, 47, 5))).toBe("14:17:05 IST");
});
