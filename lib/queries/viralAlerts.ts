// lib/queries/viralAlerts.ts
//
// Read helpers for the Viral Alerts panel and the Home page alert card.
// Writes all go through app/api/creators/* (they need the service-role
// SocialKit key), so this is read-only plus the dismiss.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface TrackedCreator {
  id: string;
  brand: string | null;
  platform: "tiktok" | "instagram";
  profileUrl: string;
  handle: string;
  viralThreshold: number;
  lastCheckedAt: string | null;
  // Why the last check produced nothing, when it produced nothing. A
  // restricted Instagram profile never resolves, so this has to persist
  // rather than living in a banner that vanishes on re-render.
  lastError: string | null;
}

export interface ViralAlertVideo {
  id: string;
  creatorHandle: string;
  brand: string | null;
  platform: "tiktok" | "instagram";
  url: string | null;
  description: string | null;
  thumbnail: string | null;
  views: number;
  velocity: number;
  postedAt: string | null;
  alertedAt: string;
}

export async function fetchTrackedCreators(supabase: SupabaseClient, clientId: string): Promise<TrackedCreator[]> {
  const { data } = await supabase
    .from("tracked_creators")
    .select("id, brand, platform, profile_url, handle, viral_threshold, last_checked_at, last_error")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  return (data || []).map((r: any) => ({
    id: r.id,
    brand: r.brand,
    platform: r.platform,
    profileUrl: r.profile_url,
    handle: r.handle || r.profile_url,
    viralThreshold: Number(r.viral_threshold) || 10000,
    lastCheckedAt: r.last_checked_at,
    lastError: r.last_error ?? null,
  }));
}

// Videos that have fired an alert, newest first. Joined through
// tracked_creators so each row can show which creator/board it came from.
export async function fetchViralAlerts(supabase: SupabaseClient, clientId: string, limit = 10): Promise<ViralAlertVideo[]> {
  const { data } = await supabase
    .from("tracked_creator_videos")
    .select("id, url, description, thumbnail, views, alerted_velocity, posted_at, alerted_at, tracked_creators!inner(client_id, handle, brand, platform, profile_url)")
    .eq("tracked_creators.client_id", clientId)
    .not("alerted_at", "is", null)
    .order("alerted_at", { ascending: false })
    .limit(limit);

  return (data || []).map((r: any) => ({
    id: r.id,
    creatorHandle: r.tracked_creators?.handle || r.tracked_creators?.profile_url || "",
    brand: r.tracked_creators?.brand || null,
    platform: r.tracked_creators?.platform,
    url: r.url,
    description: r.description,
    thumbnail: r.thumbnail,
    views: Number(r.views) || 0,
    velocity: Number(r.alerted_velocity) || 0,
    postedAt: r.posted_at,
    alertedAt: r.alerted_at,
  }));
}

// ---------- Admin: cross-client feed ----------

export interface AdminViralAlert extends ViralAlertVideo {
  clientId: string;
  clientName: string;
  niche: string | null;
}

// Every alert across every client in the org, for the Admin Viral Feed.
// No special permissions needed: private.has_client_access already returns
// true for an Admin on any client in their own organization, so the same
// RLS that scopes a client to their own data opens the whole roster to an
// Admin — a non-Admin running this simply gets their own rows back.
//
// Niche lives on the campaign, so it's resolved by matching the creator's
// brand to that client's board rather than being stored per alert. That
// means re-tagging a board updates its whole alert history at once, instead
// of leaving old alerts labelled with a niche you've since renamed.
export async function fetchAdminViralAlerts(supabase: SupabaseClient, limit = 200): Promise<AdminViralAlert[]> {
  const { data } = await supabase
    .from("tracked_creator_videos")
    .select(
      "id, url, description, thumbnail, views, alerted_velocity, posted_at, alerted_at, tracked_creators!inner(client_id, handle, brand, platform, profile_url, clients!inner(name))"
    )
    .not("alerted_at", "is", null)
    .order("alerted_at", { ascending: false })
    .limit(limit);

  const rows = data || [];
  if (rows.length === 0) return [];

  // One lookup for every (client, brand) pair present, rather than a join
  // per row — brand is only unique within a client, so the key has to be
  // both.
  const { data: campaigns } = await supabase.from("retainer_campaigns").select("client_id, brand, niche");
  const nicheByKey = new Map((campaigns || []).map((c: any) => [`${c.client_id}::${c.brand}`, c.niche as string | null]));

  return rows.map((r: any) => {
    const tc = r.tracked_creators;
    return {
      id: r.id,
      creatorHandle: tc?.handle || tc?.profile_url || "",
      brand: tc?.brand || null,
      platform: tc?.platform,
      url: r.url,
      description: r.description,
      thumbnail: r.thumbnail,
      views: Number(r.views) || 0,
      velocity: Number(r.alerted_velocity) || 0,
      postedAt: r.posted_at,
      alertedAt: r.alerted_at,
      clientId: tc?.client_id,
      clientName: tc?.clients?.name || "Unknown client",
      niche: tc?.brand ? nicheByKey.get(`${tc.client_id}::${tc.brand}`) ?? null : null,
    };
  });
}

// "Dismiss" clears alerted_at so it stops showing on Home. The video row
// itself stays, and its alerted_velocity is preserved, so the velocity
// baseline is untouched — it just won't re-alert (alerted_velocity being
// set is what marks it as already-seen for a future run).
export async function dismissViralAlert(supabase: SupabaseClient, videoId: string) {
  const { error } = await supabase.from("tracked_creator_videos").update({ alerted_at: null }).eq("id", videoId);
  if (error) throw error;
}

// ---------- Campaign niche ----------
//
// Niche is stored on the campaign, not the creator (see
// db/migration_014_campaign_niche.sql), so it's read and written by
// (client, brand) — the pair that identifies a board, since brand is only
// unique within a client.

export async function fetchCampaignNiche(supabase: SupabaseClient, clientId: string, brand: string): Promise<string | null> {
  const { data } = await supabase
    .from("retainer_campaigns")
    .select("niche")
    .eq("client_id", clientId)
    .eq("brand", brand)
    .maybeSingle();
  return data?.niche ?? null;
}

export async function updateCampaignNiche(supabase: SupabaseClient, clientId: string, brand: string, niche: string | null) {
  const { error } = await supabase
    .from("retainer_campaigns")
    .update({ niche })
    .eq("client_id", clientId)
    .eq("brand", brand);
  if (error) throw error;
}
