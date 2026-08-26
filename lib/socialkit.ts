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

export interface TranscriptSegment {
  text: string;
  timestamp: string;
  start: number;
}

export interface TranscriptResult {
  transcript: string;
  segments: TranscriptSegment[];
}

// The flat transcript is one undifferentiated block — for a two-person
// video it reads exactly like a monologue, which is how a dialogue ends up
// being prescribed as if one person said all of it. There's no speaker
// diarization available, but the per-line timings are: pauses and turn
// lengths are what make speaker changes inferable, so anything that has to
// reason about who said what needs these, not the blob.
export async function fetchTranscriptDetailed(
  platform: "tiktok" | "instagram",
  url: string,
  accessKey: string
): Promise<TranscriptResult> {
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

  const rawSegments: any[] = Array.isArray(json.data?.transcriptSegments) ? json.data.transcriptSegments : [];
  return {
    transcript: (json.data?.transcript || "").trim(),
    segments: rawSegments
      .filter((s) => s && typeof s.text === "string" && s.text.trim())
      .map((s) => ({ text: String(s.text).trim(), timestamp: String(s.timestamp ?? ""), start: Number(s.start) || 0 })),
  };
}

export async function fetchTranscript(platform: "tiktok" | "instagram", url: string, accessKey: string): Promise<string> {
  const { transcript } = await fetchTranscriptDetailed(platform, url, accessKey);
  return transcript;
}
