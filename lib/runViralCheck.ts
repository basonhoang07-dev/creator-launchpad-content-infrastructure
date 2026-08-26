// lib/runViralCheck.ts
//
// Runs one client's viral check end to end: for each tracked creator, pull
// their recent videos, reconcile against the last reading, and post any new
// hits to that client's Discord 1-on-1 channel. Shared by the manual "Check
// now" button and the daily cron so both behave identically.
//
// Every SocialKit call spends one request from the client's monthly quota
// (free tier is 20/month), so this deliberately makes exactly one request
// per tracked creator per run — no retries, no pagination beyond the first
// page.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCreatorVideos, reconcileCreatorVideos, MAX_VIDEO_AGE_DAYS, type ViralHit, type SocialkitVideo } from "@/lib/viralAlerts";
import { fetchCreatorVideosBatch, isApifyConfigured } from "@/lib/apifyCreators";
import { findChannelIdByClientName, buildViralAlertEmbed } from "@/lib/discord";

export interface TrackedCreatorRow {
  id: string;
  brand: string | null;
  platform: "tiktok" | "instagram";
  profile_url: string;
  handle: string | null;
  viral_threshold: number;
}

export interface ViralCheckResult {
  checked: number;
  hits: (ViralHit & { creatorHandle: string; brand: string | null; platform: "tiktok" | "instagram" })[];
  errors: string[];
}

export async function runViralCheckForClient(
  supabase: SupabaseClient,
  client: {
    id: string;
    name: string;
    discord_channel_id?: string | null;
    discord_webhook_url?: string | null;
    // Optional dedicated destination (e.g. a "🚨⎜viral-alerts" channel,
    // possibly in a different server). Falls back to the 1-on-1 channel.
    viral_alert_channel_id?: string | null;
  },
  creators: TrackedCreatorRow[],
  accessKey: string
): Promise<ViralCheckResult> {
  const result: ViralCheckResult = { checked: 0, hits: [], errors: [] };

  // Apify fetches every Instagram creator in ONE call and bills per result,
  // which is roughly 10x cheaper than SocialKit's per-creator-per-check
  // billing on the free tier. Pre-fetched here so the loop below can reuse
  // it; anything not covered (TikTok, or Apify not configured) still falls
  // through to the original per-creator path untouched.
  let apifyBatch: Map<string, SocialkitVideo[]> | null = null;
  let apifyErrors: Map<string, string> = new Map();
  const igCreators = creators.filter((c) => c.platform === "instagram" && c.handle);
  if (isApifyConfigured() && igCreators.length > 0) {
    try {
      const batch = await fetchCreatorVideosBatch(
        igCreators.map((c) => ({ handle: c.handle!, profileUrl: c.profile_url })),
        process.env.APIFY_API_TOKEN!,
        MAX_VIDEO_AGE_DAYS
      );
      apifyBatch = batch.byHandle;
      apifyErrors = batch.errors;
    } catch (err: any) {
      // A failed batch must not take the whole run down — record it once and
      // let each creator fall back to the per-creator source below.
      result.errors.push(`Apify batch: ${err.message || "failed"}`);
    }
  }

  for (const creator of creators) {
    const key = (creator.handle || "").toLowerCase().replace(/^@/, "");
    try {
      // A profile Instagram refuses to serve won't come back from SocialKit
      // either, so don't spend one of the client's 20 monthly requests
      // proving it — record the reason and move on.
      const blocked = apifyErrors.get(key);
      if (blocked) throw new Error(`Instagram won't serve this profile (${blocked}) — it's private or restricted.`);

      const batched = apifyBatch?.get(key);
      const videos = batched && batched.length > 0
        ? batched
        : await fetchCreatorVideos(creator.platform, creator.profile_url, accessKey);
      const hits = await reconcileCreatorVideos(supabase, creator.id, creator.viral_threshold, videos);
      result.checked++;
      await setCreatorError(supabase, creator.id, null);
      hits.forEach((h) =>
        result.hits.push({ ...h, creatorHandle: creator.handle || creator.profile_url, brand: creator.brand, platform: creator.platform })
      );
    } catch (err: any) {
      // One creator failing (deleted profile, private account) shouldn't
      // abort the rest of the run — collect and keep going. A rejected key
      // or exhausted quota will surface identically for every creator, so
      // the caller still sees it clearly.
      const message = err.message || "check failed";
      result.errors.push(`@${creator.handle || creator.profile_url}: ${message}`);
      // Persisted as well as returned: the banner disappears on the next
      // render, but a creator that can never be read needs to say so every
      // time the panel is opened, not just once.
      await setCreatorError(supabase, creator.id, message);
    }
  }

  for (const hit of result.hits) {
    await postViralAlert(client, hit);
  }

  return result;
}

// Never allowed to fail the run: this is diagnostic detail about a check,
// not part of the check itself.
async function setCreatorError(supabase: SupabaseClient, creatorId: string, message: string | null) {
  try {
    await supabase.from("tracked_creators").update({ last_error: message }).eq("id", creatorId);
  } catch {
    /* ignore */
  }
}

// Best-effort, exactly like recap delivery: the alert is already recorded in
// the DB (and shows on Home) by the time this runs, so a Discord hiccup must
// never fail the check itself.
async function postViralAlert(
  client: {
    name: string;
    discord_channel_id?: string | null;
    discord_webhook_url?: string | null;
    viral_alert_channel_id?: string | null;
  },
  hit: ViralHit & { creatorHandle: string; brand: string | null; platform: "tiktok" | "instagram" }
) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  // A dedicated viral-alerts channel wins outright when set — it's an
  // explicit choice, and unlike the 1-on-1 channel it may live in a
  // different server, so name-matching must not override it.
  const channelId =
    client.viral_alert_channel_id ||
    client.discord_channel_id ||
    (botToken ? await findChannelIdByClientName(client.name) : null);

  const embed = buildViralAlertEmbed({
    clientName: client.name,
    creatorHandle: hit.creatorHandle,
    platform: hit.platform,
    brand: hit.brand,
    description: hit.description,
    url: hit.url,
    thumbnail: hit.thumbnail,
    views: hit.views,
    velocity: hit.velocity,
  });

  try {
    if (botToken && channelId) {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
      if (!res.ok) console.error("[viralAlert] Discord bot post failed", res.status, await res.text());
      return;
    }
    if (client.discord_webhook_url) {
      await fetch(client.discord_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }
  } catch (err) {
    console.error("[viralAlert] Discord post failed", err);
  }
}
