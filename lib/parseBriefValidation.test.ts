import { describe, it, expect } from "vitest";
import { sanitizeParsedBrief } from "./parseBriefValidation";

describe("sanitizeParsedBrief", () => {
  it("passes through a well-formed response", () => {
    const result = sanitizeParsedBrief({
      brand: "Cluely",
      rate: 35,
      minPosts: 1,
      maxPosts: 3,
      bonusTiers: [{ views: 50000, bonus: 150 }, { views: 10000, bonus: 50 }],
    });
    expect(result).toEqual({
      brand: "Cluely",
      rate: 35,
      minPosts: 1,
      maxPosts: 3,
      bonusTiers: [{ views: 10000, bonus: 50 }, { views: 50000, bonus: 150 }], // sorted ascending
    });
  });

  it("defaults every field when Claude returns garbage or nothing", () => {
    expect(sanitizeParsedBrief({})).toEqual({ brand: "", rate: 0, minPosts: 0, maxPosts: 0, bonusTiers: [] });
    expect(sanitizeParsedBrief(null)).toEqual({ brand: "", rate: 0, minPosts: 0, maxPosts: 0, bonusTiers: [] });
  });

  it("rejects negative or non-numeric rate/min/max instead of writing a bad pay rate", () => {
    const result = sanitizeParsedBrief({ brand: "X", rate: -35, minPosts: "not a number", maxPosts: NaN });
    expect(result.rate).toBe(0);
    expect(result.minPosts).toBe(0);
    expect(result.maxPosts).toBe(0);
  });

  it("widens maxPosts up to minPosts rather than leaving a contradictory campaign", () => {
    const result = sanitizeParsedBrief({ brand: "X", rate: 10, minPosts: 5, maxPosts: 2 });
    expect(result.maxPosts).toBe(5);
  });

  it("drops bonus tiers with zero/negative views or bonus", () => {
    const result = sanitizeParsedBrief({
      brand: "X",
      bonusTiers: [
        { views: 10000, bonus: 50 },
        { views: 0, bonus: 100 },
        { views: 5000, bonus: -10 },
        { views: -1, bonus: 20 },
      ],
    });
    expect(result.bonusTiers).toEqual([{ views: 10000, bonus: 50 }]);
  });

  it("ignores bonusTiers entirely if it isn't an array", () => {
    const result = sanitizeParsedBrief({ brand: "X", bonusTiers: "10000 views = $50" });
    expect(result.bonusTiers).toEqual([]);
  });

  it("truncates an absurdly long brand name rather than choking on it", () => {
    const result = sanitizeParsedBrief({ brand: "x".repeat(500) });
    expect(result.brand.length).toBe(200);
  });
});
