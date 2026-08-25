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
import { fetchCreatorVideos, reconcileCreatorVideos, type ViralHit } from "@/lib/viralAlerts";
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

  for (const creator of creators) {
    try {
      const videos = await fetchCreatorVideos(creator.platform, creator.profile_url, accessKey);
      const hits = await reconcileCreatorVideos(supabase, creator.id, creator.viral_threshold, videos);
      result.checked++;
      hits.forEach((h) =>
        result.hits.push({ ...h, creatorHandle: creator.handle || creator.profile_url, brand: creator.brand, platform: creator.platform })
      );
    } catch (err: any) {
      // One creator failing (deleted profile, private account) shouldn't
      // abort the rest of the run — collect and keep going. A rejected key
      // or exhausted quota will surface identically for every creator, so
      // the caller still sees it clearly.
      result.errors.push(`@${creator.handle || creator.profile_url}: ${err.message || "check failed"}`);
    }
  }

  for (const hit of result.hits) {
    await postViralAlert(client, hit);
  }

  return result;
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
