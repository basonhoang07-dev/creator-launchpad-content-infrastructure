// lib/socialkit.ts
//
// SocialKit transcript access, shared by the reference-breakdown route and
// the viral-alert → Format SOP route.
//
// Lives here rather than in one of those routes because both need the exact
// same key resolution and error wording: the key is per-client (Integrations
// → SocialKit) so each client's transcripts come out of their own free-tier
// quota, with SOCIALKIT_API_KEY as an org-wide fallback.

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export function detectPlatform(url: string): "tiktok" | "instagram" | null {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return null;
}

// Read via the service-role client — socialkit_connections is RLS-locked
// with no policies, same as the Google token tables.
export async function getSocialkitKey(clientId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("socialkit_connections").select("api_key").eq("client_id", clientId).maybeSingle();
  return data?.api_key || process.env.SOCIALKIT_API_KEY || null;
}

export async function fetchTranscript(platform: "tiktok" | "instagram", url: string, accessKey: string): Promise<string> {
  const endpoint = `https://api.socialkit.dev/${platform}/transcript?access_key=${encodeURIComponent(accessKey)}&url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint);
  const json = await res.json().catch(() => ({}));

  // A rejected key looks nothing like a bad video link to the user — call it
  // out explicitly instead of letting it read as "this video won't work."
  if (res.status === 401 || res.status === 403) {
    throw new Error("SocialKit rejected that API key — reconnect it under Integrations.");
  }
  if (res.status === 429) {
    throw new Error("You've used up this month's SocialKit breakdowns (free tier is 20/month) — it resets next month.");
  }
  if (!res.ok || !json.success) {
    throw new Error(json?.error || `Couldn't fetch that ${platform === "tiktok" ? "TikTok" : "Instagram"} video's transcript — check the link is public`);
  }
  return (json.data?.transcript || "").trim();
}
