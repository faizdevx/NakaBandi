import { describe, expect, it } from "vitest";
import { cardFilename, cardSticker, levelShares } from "./cityCard";

describe("cardSticker", () => {
  it("follows the measured level", () => {
    expect(cardSticker("free")).toBe("aura");
    expect(cardSticker("moderate")).toBeNull();
    expect(cardSticker("heavy")).toBe("game-over");
    expect(cardSticker("severe")).toBe("game-over");
  });

  it("gives no verdict without live data", () => {
    expect(cardSticker("unavailable")).toBeNull();
  });
});

describe("levelShares", () => {
  it("splits road length and drops empty levels", () => {
    expect(levelShares({ free: 30, moderate: 0, heavy: 10, severe: 0, unavailable: 0 })).toEqual([
      { level: "free", share: 0.75 },
      { level: "heavy", share: 0.25 },
    ]);
  });

  it("returns nothing when no road length exists", () => {
    expect(levelShares({ free: 0, moderate: 0, heavy: 0, severe: 0, unavailable: 0 })).toEqual([]);
  });
});

describe("cardFilename", () => {
  it("keeps only safe characters", () => {
    expect(cardFilename("New Delhi / NCR", "2026-11-03T12:00:00Z")).toBe("nakabandi-new-delhi-ncr-2026-11-03.png");
  });

  it("keeps non-Latin names and falls back when empty", () => {
    expect(cardFilename("दिल्ली", "2026-11-03T12:00:00Z")).toMatch(/^nakabandi-.+-2026-11-03\.png$/);
    expect(cardFilename("///", "2026-11-03T12:00:00Z")).toBe("nakabandi-city-2026-11-03.png");
  });
});
