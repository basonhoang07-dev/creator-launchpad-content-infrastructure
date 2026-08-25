import { describe, it, expect } from "vitest";
import { computeVelocity, velocityForNewVideo, isRecentEnough, parseCreatorInput, normalizeSocialkitVideos, formatVelocity } from "./viralAlerts";

const NOW = new Date("2026-08-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function video(overrides: Partial<Parameters<typeof velocityForNewVideo>[0]> = {}) {
  return { videoId: "v1", url: null, description: null, thumbnail: null, createTime: hoursAgo(2), views: 0, likes: 0, ...overrides };
}

describe("computeVelocity", () => {
  it("extrapolates views gained between two readings to a 24h rate", () => {
    // 5,000 views gained over 12h -> 10,000/24h
    expect(computeVelocity(15000, 10000, hoursAgo(12), NOW)).toBe(10000);
  });

  it("returns null with no prior reading — a first sighting has no baseline", () => {
    expect(computeVelocity(15000, null, null, NOW)).toBeNull();
  });

  it("returns null when the readings are too close together to extrapolate honestly", () => {
    // A 500-view bump 2 minutes apart would otherwise imply 360,000/24h.
    expect(computeVelocity(10500, 10000, hoursAgo(0.03), NOW)).toBeNull();
  });

  it("treats a flat or decreasing count as zero rather than negative", () => {
    expect(computeVelocity(10000, 10000, hoursAgo(12), NOW)).toBe(0);
    expect(computeVelocity(9000, 10000, hoursAgo(12), NOW)).toBe(0);
  });
});

describe("velocityForNewVideo", () => {
  it("uses total views as the rate for a video posted within the last day", () => {
    // 6,000 views in 12h -> 12,000/24h
    expect(velocityForNewVideo(video({ views: 6000, createTime: hoursAgo(12) }), NOW)).toBe(12000);
  });

  it("returns null for a video older than 24h — its total isn't a current rate", () => {
    expect(velocityForNewVideo(video({ views: 500000, createTime: hoursAgo(72) }), NOW)).toBeNull();
  });

  it("returns null when the platform gave no post date", () => {
    expect(velocityForNewVideo(video({ views: 50000, createTime: null }), NOW)).toBeNull();
  });
});

describe("isRecentEnough", () => {
  it("keeps videos inside the 14-day window and drops back catalogue", () => {
    expect(isRecentEnough(video({ createTime: hoursAgo(24 * 3) }), NOW)).toBe(true);
    expect(isRecentEnough(video({ createTime: hoursAgo(24 * 40) }), NOW)).toBe(false);
  });

  it("keeps a video with no date rather than silently excluding it", () => {
    expect(isRecentEnough(video({ createTime: null }), NOW)).toBe(true);
  });
});

describe("parseCreatorInput", () => {
  it("accepts a bare handle, with or without the @", () => {
    expect(parseCreatorInput("@someone", "tiktok")).toEqual({ profileUrl: "https://www.tiktok.com/@someone", handle: "someone" });
    expect(parseCreatorInput("someone", "instagram")).toEqual({ profileUrl: "https://www.instagram.com/someone", handle: "someone" });
  });

  it("pulls the handle out of a full profile URL on either platform", () => {
    expect(parseCreatorInput("https://www.tiktok.com/@thepeteffect", "tiktok")).toEqual({
      profileUrl: "https://www.tiktok.com/@thepeteffect",
      handle: "thepeteffect",
    });
    expect(parseCreatorInput("https://www.instagram.com/somebrand/", "instagram")).toEqual({
      profileUrl: "https://www.instagram.com/somebrand",
      handle: "somebrand",
    });
  });

  it("rejects empty or unusable input", () => {
    expect(parseCreatorInput("", "tiktok")).toBeNull();
    expect(parseCreatorInput("   ", "tiktok")).toBeNull();
  });
});

describe("normalizeSocialkitVideos", () => {
  it("coerces missing counts to 0 and drops entries with no id", () => {
    expect(normalizeSocialkitVideos([{ videoId: "a", views: "1200" }, { description: "no id" }])).toEqual([
      { videoId: "a", url: null, description: null, thumbnail: null, createTime: null, views: 1200, likes: 0 },
    ]);
  });

  it("survives a null/undefined list", () => {
    expect(normalizeSocialkitVideos(null as any)).toEqual([]);
  });
});

describe("formatVelocity", () => {
  it("abbreviates thousands and millions without trailing .0", () => {
    expect(formatVelocity(950)).toBe("950");
    expect(formatVelocity(10000)).toBe("10K");
    expect(formatVelocity(12500)).toBe("12.5K");
    expect(formatVelocity(2_000_000)).toBe("2M");
  });
});
