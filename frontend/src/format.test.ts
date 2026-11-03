import { describe, expect, it } from "vitest";
import { fmtAgo, fmtClock } from "./format";

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

it("fmtClock shows India time with seconds", () => {
  expect(fmtClock(Date.UTC(2026, 10, 3, 8, 47, 5))).toBe("14:17:05 IST");
});
