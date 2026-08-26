// lib/viralAlerts.ts
//
// Core of the "Viral Alert" feature: pull a tracked creator's recent videos
// from SocialKit, compare each against the previous reading to get a
// views-per-24h velocity, and surface the ones climbing faster than that
// creator's threshold.
//
// Shared between the manual "Check now" button (app/api/creators/check) and
// the daily cron (app/api/cron/viral-check) so the detection rule can never
// drift between "I clicked it" and "it ran overnight".

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SocialkitVideo {
  videoId: string;
  url: string | null;
  description: string | null;
  thumbnail: string | null;
  createTime: string | null;
  views: number;
  likes: number;
}

export interface ViralHit {
  videoId: string;
  url: string | null;
  description: string | null;
  thumbnail: string | null;
  views: number;
  velocity: number;
  postedAt: string | null;
}

const MS_PER_HOUR = 3_600_000;

// Only ever consider recent videos — an old video with a huge total view
// count isn't "going viral now", and including them would fire an alert for
// back catalogue the first time a creator is ever checked.
export const MAX_VIDEO_AGE_DAYS = 14;

// Floor for what counts as "going viral", in views gained per 24h. Set
// deliberately high: an alert is only worth sending if the video is doing
// numbers worth studying, and calibrating per-creator (so a small account's
// ordinary post trips the wire) produces noise rather than signal. Applied
// as a minimum, not a default — a lower value can't be saved.
export const VIRAL_THRESHOLD_MIN = 10000;

// Below this, a velocity number is too noisy to trust: two readings a few
// minutes apart can extrapolate a tiny bump into a huge fake 24h rate.
const MIN_HOURS_BETWEEN_READINGS = 1;

// TikTok's channel-videos and Instagram's channel-reels return the same
// information under different names — TikTok gives videoId/description/
// thumbnail/createTime (ISO), Instagram gives no id at all plus caption/
// thumbnailUrl/timestamp (Unix seconds) and views-or-plays. Normalizing both
// here means the velocity math never has to know which platform it came
// from. Instagram's lack of an id is why url is the last-resort key: it's
// stable per reel, which is all the unique(tracked_creator_id, video_id)
// constraint needs.
export function normalizeSocialkitVideos(raw: any[]): SocialkitVideo[] {
  return (raw || [])
    .map((v) => {
      if (!v) return null;
      const id = v.videoId ?? v.id ?? v.pk ?? v.code ?? v.shortcode ?? v.url;
      if (!id) return null;

      let createTime: string | null = v.createTime || null;
      if (!createTime && v.timestamp) {
        // Unix seconds (Instagram) vs already-milliseconds — anything below
        // ~1e11 is seconds, since ms timestamps for real dates are ~1.7e12.
        const n = Number(v.timestamp);
        if (Number.isFinite(n) && n > 0) {
          createTime = new Date(n < 1e11 ? n * 1000 : n).toISOString();
        }
      }

      return {
        videoId: String(id),
        url: v.url || null,
        description: v.description ?? v.caption ?? null,
        thumbnail: v.thumbnail ?? v.thumbnailUrl ?? null,
        createTime,
        views: Number(v.views ?? v.plays ?? v.playCount) || 0,
        likes: Number(v.likes ?? v.likeCount) || 0,
      };
    })
    .filter((v): v is SocialkitVideo => v !== null);
}

export async function fetchCreatorVideos(
  platform: "tiktok" | "instagram",
  profileUrl: string,
  accessKey: string
): Promise<SocialkitVideo[]> {
  // Instagram's equivalent endpoint is channel-reels; TikTok's is
  // channel-videos. Same request/response shape otherwise.
  const path = platform === "tiktok" ? "tiktok/channel-videos" : "instagram/channel-reels";
  const endpoint = `https://api.socialkit.dev/${path}?access_key=${encodeURIComponent(accessKey)}&url=${encodeURIComponent(profileUrl)}&limit=30`;

  const res = await fetch(endpoint);
  const json = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    throw new Error("SocialKit rejected that API key — reconnect it under Integrations.");
  }
  if (res.status === 429) {
    throw new Error("You've used up this month's SocialKit requests (free tier is 20/month) — it resets next month.");
  }
  if (!res.ok || !json.success) {
    throw new Error(json?.error || "Couldn't load that creator's videos — check the profile URL is public.");
  }

  const list = json.data?.videos || json.data?.reels || json.data?.items || [];
  return normalizeSocialkitVideos(list);
}

// Views gained per 24h between two readings. Null when there's no usable
// baseline (first time we've seen the video, or the readings are too close
// together to extrapolate honestly).
export function computeVelocity(
  currentViews: number,
  previousViews: number | null,
  previousCheckedAt: string | null,
  now: Date = new Date()
): number | null {
  if (previousViews === null || previousViews === undefined || !previousCheckedAt) return null;
  const hours = (now.getTime() - new Date(previousCheckedAt).getTime()) / MS_PER_HOUR;
  if (hours < MIN_HOURS_BETWEEN_READINGS) return null;
  const gained = currentViews - previousViews;
  if (gained <= 0) return 0;
  return Math.round((gained / hours) * 24);
}

// A video we're seeing for the first time has no baseline to measure
// against — but one that's racked up its views within the last day is
// self-evidently moving, so treat its total as the 24h rate.
export function velocityForNewVideo(video: SocialkitVideo, now: Date = new Date()): number | null {
  if (!video.createTime) return null;
  const ageHours = (now.getTime() - new Date(video.createTime).getTime()) / MS_PER_HOUR;
  if (ageHours <= 0 || ageHours > 24) return null;
  return Math.round((video.views / ageHours) * 24);
}

export function isRecentEnough(video: SocialkitVideo, now: Date = new Date()): boolean {
  if (!video.createTime) return true; // no date given — don't exclude it outright
  const ageDays = (now.getTime() - new Date(video.createTime).getTime()) / (MS_PER_HOUR * 24);
  return ageDays <= MAX_VIDEO_AGE_DAYS;
}

// Reconciles one creator's freshly-fetched videos against what's stored,
// rolling the previous reading forward and returning whichever videos
// crossed the threshold on this pass. Videos that already alerted are never
// returned again.
export async function reconcileCreatorVideos(
  supabase: SupabaseClient,
  trackedCreatorId: string,
  threshold: number,
  videos: SocialkitVideo[],
  now: Date = new Date()
): Promise<ViralHit[]> {
  const nowIso = now.toISOString();
  const relevant = videos.filter((v) => isRecentEnough(v, now));
  if (relevant.length === 0) return [];

  const { data: existingRows } = await supabase
    .from("tracked_creator_videos")
    .select("video_id, views, checked_at, alerted_at")
    .eq("tracked_creator_id", trackedCreatorId)
    .in("video_id", relevant.map((v) => v.videoId));

  const existing = new Map((existingRows || []).map((r: any) => [r.video_id, r]));
  const hits: ViralHit[] = [];
  const rows: any[] = [];

  for (const video of relevant) {
    const prior = existing.get(video.videoId);
    const alreadyAlerted = !!prior?.alerted_at;

    const velocity = prior
      ? computeVelocity(video.views, prior.views, prior.checked_at, now)
      : velocityForNewVideo(video, now);

    const isHit = !alreadyAlerted && velocity !== null && velocity >= threshold;
    if (isHit) {
      hits.push({
        videoId: video.videoId,
        url: video.url,
        description: video.description,
        thumbnail: video.thumbnail,
        views: video.views,
        velocity: velocity!,
        postedAt: video.createTime,
      });
    }

    rows.push({
      tracked_creator_id: trackedCreatorId,
      video_id: video.videoId,
      url: video.url,
      description: video.description,
      thumbnail: video.thumbnail,
      posted_at: video.createTime,
      views: video.views,
      likes: video.likes,
      checked_at: nowIso,
      // Roll the current reading into "previous" only when there was one —
      // otherwise this pass becomes the baseline for the next.
      previous_views: prior ? prior.views : null,
      previous_checked_at: prior ? prior.checked_at : null,
      ...(isHit ? { alerted_at: nowIso, alerted_velocity: velocity } : {}),
      ...(alreadyAlerted ? { alerted_at: prior.alerted_at } : {}),
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("tracked_creator_videos")
      .upsert(rows, { onConflict: "tracked_creator_id,video_id" });
    if (error) throw error;
  }

  await supabase.from("tracked_creators").update({ last_checked_at: nowIso }).eq("id", trackedCreatorId);

  return hits;
}

export function formatVelocity(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

// Accepts a full profile URL or a bare @handle and returns both the
// canonical URL to store and the handle to display.
export function parseCreatorInput(input: string, platform: "tiktok" | "instagram"): { profileUrl: string; handle: string } | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const seg = u.pathname.split("/").filter(Boolean);
      const handle = (seg.find((s) => s.startsWith("@")) || seg[0] || "").replace(/^@/, "");
      if (!handle) return null;
      return {
        profileUrl: platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}`,
        handle,
      };
    } catch {
      return null;
    }
  }

  const handle = raw.replace(/^@/, "").split("/")[0];
  if (!handle) return null;
  return {
    profileUrl: platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}`,
    handle,
  };
}
