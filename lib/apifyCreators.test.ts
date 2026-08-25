import { describe, it, expect } from "vitest";
import { normalizeApifyReels } from "./apifyCreators";

// Apify returns one flat array covering every profile in the run, using
// different field names to SocialKit — play count, ISO timestamp, caption,
// displayUrl — so this is the layer where a mistake would silently attribute
// one creator's views to another and poison their velocity baseline.
const reel = (o: Record<string, unknown> = {}) => ({
  id: "3712345678901234567",
  shortCode: "DNxAbCdEfGh",
  url: "https://www.instagram.com/reel/DNxAbCdEfGh/",
  caption: "how i landed my first UGC deal",
  displayUrl: "https://scontent.cdninstagram.com/x.jpg",
  timestamp: "2026-08-24T10:00:00.000Z",
  videoPlayCount: 41200,
  likesCount: 980,
  ownerUsername: "ollysung",
  ...o,
});

describe("normalizeApifyReels", () => {
  it("maps Apify's field names onto the shared video shape", () => {
    expect(normalizeApifyReels([reel()])).toEqual([
      {
        owner: "ollysung",
        video: {
          videoId: "3712345678901234567",
          url: "https://www.instagram.com/reel/DNxAbCdEfGh/",
          description: "how i landed my first UGC deal",
          thumbnail: "https://scontent.cdninstagram.com/x.jpg",
          createTime: "2026-08-24T10:00:00.000Z",
          views: 41200,
          likes: 980,
        },
      },
    ]);
  });

  it("falls back to videoViewCount when playCount is absent", () => {
    const [{ video }] = normalizeApifyReels([reel({ videoPlayCount: undefined, videoViewCount: 7300 })]);
    expect(video.views).toBe(7300);
  });

  it("lowercases the owner so attribution survives casing differences", () => {
    expect(normalizeApifyReels([reel({ ownerUsername: "OllySung" })])[0].owner).toBe("ollysung");
    expect(normalizeApifyReels([reel({ ownerUsername: "@OllySung" })])[0].owner).toBe("ollysung");
  });

  it("keeps each item attributed to its own creator in a multi-profile run", () => {
    const items = normalizeApifyReels([
      reel({ id: "a", ownerUsername: "ollysung", videoPlayCount: 100 }),
      reel({ id: "b", ownerUsername: "itsthienvuvo", videoPlayCount: 200 }),
      reel({ id: "c", ownerUsername: "ollysung", videoPlayCount: 300 }),
    ]);
    expect(items.map((i) => [i.owner, i.video.views])).toEqual([
      ["ollysung", 100],
      ["itsthienvuvo", 200],
      ["ollysung", 300],
    ]);
  });

  it("drops entries with no usable id rather than inventing one", () => {
    expect(normalizeApifyReels([{ caption: "no id", url: null, ownerUsername: "x" }])).toEqual([]);
  });

  it("leaves createTime null on an unparseable timestamp instead of Invalid Date", () => {
    const [{ video }] = normalizeApifyReels([reel({ timestamp: "not-a-date" })]);
    expect(video.createTime).toBeNull();
  });

  it("survives a null list", () => {
    expect(normalizeApifyReels(null as any)).toEqual([]);
  });
});
