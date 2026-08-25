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
    .select("id, brand, platform, profile_url, handle, viral_threshold, last_checked_at")
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

// "Dismiss" clears alerted_at so it stops showing on Home. The video row
// itself stays, and its alerted_velocity is preserved, so the velocity
// baseline is untouched — it just won't re-alert (alerted_velocity being
// set is what marks it as already-seen for a future run).
export async function dismissViralAlert(supabase: SupabaseClient, videoId: string) {
  const { error } = await supabase.from("tracked_creator_videos").update({ alerted_at: null }).eq("id", videoId);
  if (error) throw error;
}
