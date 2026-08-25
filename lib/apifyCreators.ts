// lib/apifyCreators.ts
//
// Cheaper data source for Viral Alert creator feeds.
//
// Why this exists: SocialKit bills one request per creator per check, and
// its free tier is 20 requests/month — so watching 4 creators buys you five
// checks for the whole month, which is far too slow to catch anything
// actually going viral. Apify bills per RESULT instead, gives $5 of credit
// every month (renewing, no card), and — critically — takes an ARRAY of
// usernames, so every tracked creator is fetched in ONE call.
//
// Cost, measured against the real numbers: 4 creators x ~10 recent reels =
// ~40 results at $0.0026 = about $0.10 per check, so roughly 48 checks a
// month inside the free credit. Same money as SocialKit's paid tier, at
// zero. onlyPostsNewerThan trims results to the window we'd filter to
// anyway (MAX_VIDEO_AGE_DAYS), so we never pay for back catalogue.
//
// SocialKit is still used for transcripts (the Breakdown tool) — that's
// low-volume by nature, so its free 20/month comfortably covers it. This
// only replaces the high-volume creator-feed side, and only when
// APIFY_API_TOKEN is set; otherwise the SocialKit path is unchanged.

import type { SocialkitVideo } from "@/lib/viralAlerts";

const ACTOR = "apify~instagram-reel-scraper";

// Apify's sync endpoint blocks until the run finishes. Kept under the
// route's own 60s maxDuration so we fail on our terms with a usable
// message rather than having the platform cut the response mid-flight.
const RUN_TIMEOUT_SECONDS = 50;

export interface ApifyCreatorRequest {
  handle: string;
  profileUrl: string;
}

// Apify returns one flat array for every profile in the run, so each item
// has to be attributed back to the creator it came from.
function ownerOf(item: any): string | null {
  const owner = item?.ownerUsername ?? item?.ownerUserName ?? item?.owner?.username ?? null;
  return owner ? String(owner).toLowerCase().replace(/^@/, "") : null;
}

export function normalizeApifyReels(raw: any[]): { owner: string | null; video: SocialkitVideo }[] {
  return (raw || [])
    .map((v) => {
      if (!v) return null;
      const id = v.id ?? v.shortCode ?? v.shortcode ?? v.url;
      if (!id) return null;

      // Apify sends an ISO string here, unlike SocialKit's Unix seconds.
      let createTime: string | null = null;
      if (v.timestamp) {
        const d = new Date(v.timestamp);
        if (!Number.isNaN(d.getTime())) createTime = d.toISOString();
      }

      return {
        owner: ownerOf(v),
        video: {
          videoId: String(id),
          url: v.url || null,
          description: v.caption ?? null,
          thumbnail: v.displayUrl ?? v.thumbnailUrl ?? null,
          createTime,
          views: Number(v.videoPlayCount ?? v.videoViewCount ?? v.playCount ?? 0) || 0,
          likes: Number(v.likesCount ?? v.likeCount ?? 0) || 0,
        },
      };
    })
    .filter((x): x is { owner: string | null; video: SocialkitVideo } => x !== null);
}

// One call for every tracked creator. Returns a per-handle map so the
// caller can reconcile each creator's videos independently, exactly as it
// does with the one-request-per-creator path.
export async function fetchCreatorVideosBatch(
  creators: ApifyCreatorRequest[],
  token: string,
  maxAgeDays: number
): Promise<Map<string, SocialkitVideo[]>> {
  const handles = creators.map((c) => c.handle.replace(/^@/, ""));
  const endpoint = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${RUN_TIMEOUT_SECONDS}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: handles,
      resultsLimit: 10,
      onlyPostsNewerThan: `${maxAgeDays} days`,
      skipPinnedPosts: true,
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Apify rejected that API token — check APIFY_API_TOKEN.");
  }
  if (res.status === 402) {
    throw new Error("Apify's monthly free credit is used up — it resets next billing cycle.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify run failed (${res.status}) — ${text.slice(0, 140)}`);
  }

  const items = await res.json().catch(() => []);
  const byHandle = new Map<string, SocialkitVideo[]>();
  handles.forEach((h) => byHandle.set(h.toLowerCase(), []));

  for (const { owner, video } of normalizeApifyReels(items)) {
    // An item whose owner doesn't match anything we asked for is not
    // silently dropped into the wrong creator's bucket — it's skipped, so a
    // mismatch can never corrupt another creator's velocity baseline.
    if (!owner || !byHandle.has(owner)) continue;
    byHandle.get(owner)!.push(video);
  }

  return byHandle;
}

export function isApifyConfigured(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}
