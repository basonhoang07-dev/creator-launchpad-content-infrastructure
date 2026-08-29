// lib/transcripts.ts
//
// One place that decides where a transcript comes from, so the Breakdown
// tool and Format SOP generation can't drift apart on sourcing or on what
// they tell the user when it fails.
//
// Apify goes first for Instagram: it bills ~$0.01 per transcript against a
// renewing $5 credit (roughly 500/month) instead of SocialKit's hard cap of
// 20 a month for the whole org on one shared key. SocialKit stays as the
// fallback and as the only path for TikTok, so nothing that worked before
// stops working — it's just no longer the thing standing between a client
// and a breakdown on the 20th of the month.

import { fetchTranscriptDetailed, type TranscriptResult } from "@/lib/socialkit";
import { fetchApifyTranscript, isApifyTranscriptConfigured } from "@/lib/apifyTranscript";

export interface ResolvedTranscript extends TranscriptResult {
  source: "apify" | "socialkit";
}

export async function getTranscript(
  platform: "tiktok" | "instagram",
  url: string,
  socialkitKey: string | null
): Promise<ResolvedTranscript> {
  const apifyErrors: string[] = [];

  if (platform === "instagram" && isApifyTranscriptConfigured()) {
    try {
      const result = await fetchApifyTranscript(url, process.env.APIFY_API_TOKEN!);
      if (result.transcript) return { ...result, source: "apify" };
      apifyErrors.push("Apify returned an empty transcript");
    } catch (err: any) {
      // Falling through to SocialKit rather than failing: one flaky actor
      // run shouldn't take the feature down when a working source exists.
      apifyErrors.push(err?.message || "Apify transcript failed");
    }
  }

  if (!socialkitKey) {
    throw new Error(
      apifyErrors.length
        ? `Couldn't fetch that transcript (${apifyErrors[0]}), and no SocialKit key is connected as a fallback.`
        : "That client hasn't connected SocialKit — connect it under Integrations to pull transcripts."
    );
  }

  const result = await fetchTranscriptDetailed(platform, url, socialkitKey);
  return { ...result, source: "socialkit" };
}
