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
  it("coerces missing counts to 0 and drops entries with no usable id", () => {
    expect(normalizeSocialkitVideos([{ videoId: "a", views: "1200" }, { description: "no id, no url" }])).toEqual([
      { videoId: "a", url: null, description: null, thumbnail: null, createTime: null, views: 1200, likes: 0 },
    ]);
  });

  it("reads TikTok's channel-videos shape", () => {
    expect(
      normalizeSocialkitVideos([
        { videoId: "7522", url: "https://tiktok.com/x", description: "cap", thumbnail: "https://t/1.jpg", createTime: "2026-08-24T10:00:00Z", views: 5000, likes: 12 },
      ])
    ).toEqual([
      { videoId: "7522", url: "https://tiktok.com/x", description: "cap", thumbnail: "https://t/1.jpg", createTime: "2026-08-24T10:00:00Z", views: 5000, likes: 12 },
    ]);
  });

  it("reads Instagram's channel-reels shape — different field names, no id, Unix-seconds timestamp", () => {
    // Regression: the old normalizer required `videoId` and would have
    // dropped every Instagram reel, making IG tracking silently return zero.
    expect(
      normalizeSocialkitVideos([
        { url: "https://www.instagram.com/reel/ABC/", caption: "my caption", thumbnailUrl: "https://ig/1.jpg", timestamp: 1756029600, plays: 8200 },
      ])
    ).toEqual([
      {
        videoId: "https://www.instagram.com/reel/ABC/",
        url: "https://www.instagram.com/reel/ABC/",
        description: "my caption",
        thumbnail: "https://ig/1.jpg",
        createTime: new Date(1756029600 * 1000).toISOString(),
        views: 8200,
        likes: 0,
      },
    ]);
  });

  it("treats an already-millisecond timestamp as milliseconds, not seconds", () => {
    const ms = 1756029600000;
    expect(normalizeSocialkitVideos([{ id: "z", timestamp: ms, views: 1 }])[0].createTime).toBe(new Date(ms).toISOString());
  });

  it("handles a real Instagram channel-reels item, captured live from the API", () => {
    // Captured from api.socialkit.dev/instagram/channel-reels — the docs list
    // the fields but not `id`, and the shape is what the old normalizer choked
    // on. Pinned here so a future edit can't silently reintroduce that.
    const live = {
      id: "3712345678901234567",
      shortcode: "DNxAbCdEfGh",
      url: "https://www.instagram.com/reel/DNxAbCdEfGh/",
      type: "video",
      isVideo: true,
      caption: "Soothing spacewalk scenes.",
      likes: 210_000,
      comments: 1_200,
      views: 3_060_716,
      plays: 3_060_716,
      duration: 31.2,
      timestamp: 1787081860,
      thumbnailUrl: "https://scontent.cdninstagram.com/x.jpg",
      videoUrl: "https://scontent.cdninstagram.com/x.mp4",
      width: 1080,
      height: 1920,
    };
    expect(normalizeSocialkitVideos([live])).toEqual([
      {
        videoId: "3712345678901234567",
        url: "https://www.instagram.com/reel/DNxAbCdEfGh/",
        description: "Soothing spacewalk scenes.",
        thumbnail: "https://scontent.cdninstagram.com/x.jpg",
        createTime: new Date(1787081860 * 1000).toISOString(),
        views: 3_060_716,
        likes: 210_000,
      },
    ]);
  });

  it("survives a null/undefined list", () => {
    expect(normalizeSocialkitVideos(null as any)).toEqual([]);
  });
});

describe("first check establishes a baseline rather than alerting", () => {
  it("does not fire on a creator's back catalogue the first time they're tracked", () => {
    // Every video older than 24h has no previous reading on a first check, so
    // there's nothing to measure a rate against — which is exactly what stops
    // "track a creator" from dumping their whole history into Discord.
    const backCatalogue = [
      video({ views: 3_060_716, createTime: hoursAgo(165) }),
      video({ views: 9_093_943, createTime: hoursAgo(264) }),
    ];
    backCatalogue.forEach((v) => {
      expect(velocityForNewVideo(v, NOW)).toBeNull();
      expect(computeVelocity(v.views, null, null, NOW)).toBeNull();
    });
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
