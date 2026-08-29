// lib/apifyTranscript.ts
//
// Transcripts via Apify, so the free tier that actually binds is a
// per-result cost against renewing credit rather than a hard monthly count.
//
// Why this exists: SocialKit's free plan is 20 transcripts a MONTH across
// the whole org — one shared key — and it ran out. When it does, it returns
// 403 and both the client-facing Breakdown tool and Format SOP generation
// stop working until the 1st. Apify bills ~$0.01 per transcript against a
// $5 monthly credit that renews without a card: roughly 500 a month, and
// the same account already pays for creator feeds (see lib/apifyCreators).
//
// What was considered and rejected:
//   - sian.agency/instagram-ai-transcript-extractor advertises free speaker
//     diarization, which would have removed the speaker-inference guesswork
//     entirely — but it blocks free-plan API access and only runs from the
//     Apify Console.
//   - Chaining kaz_kakyo/audio-transcriber (diarize: true) off the audioUrl
//     this actor returns. Tested on a real two-person phone-call reel: it
//     labelled the whole thing "Speaker 0", because both voices arrive
//     through one channel. Not worth ~2x the cost for a label that's wrong
//     on exactly the content type that needs it.
//
// So the speaker attribution stays where it works — inferred in the
// Format SOP prompt from second-person address and question/answer pairs,
// which resolves this reel correctly from flat text alone.

import type { TranscriptResult, TranscriptSegment } from "@/lib/socialkit";

const IG_ACTOR = "apple_yang~instagram-transcripts-scraper";

// Apify's sync endpoint blocks until the run finishes. Kept under the
// calling route's 60s maxDuration so a slow run fails on our terms.
const RUN_TIMEOUT_SECONDS = 45;

export function isApifyTranscriptConfigured(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}

// This actor returns paragraph-sized chunks (three for a 76s reel) rather
// than the caption-level lines SocialKit gives, so per-line pause markers
// aren't available from it. That's fine: the pause signal was only ever a
// hint for working out speaker turns, and the wording — who is addressed as
// "you", which line answers which question — carries that on its own.
function normalizeSegments(raw: any): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s.text === "string" && s.text.trim())
    .map((s) => {
      const start = Number(s.start) || 0;
      const mins = Math.floor(start / 60);
      const secs = Math.floor(start % 60);
      return { text: String(s.text).trim(), timestamp: `${mins}:${String(secs).padStart(2, "0")}`, start };
    });
}

export async function fetchApifyTranscript(url: string, token: string): Promise<TranscriptResult> {
  const endpoint = `https://api.apify.com/v2/acts/${IG_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${RUN_TIMEOUT_SECONDS}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl: url }),
  });

  if (res.status === 401 || res.status === 403) throw new Error("Apify rejected that API token — check APIFY_API_TOKEN.");
  if (res.status === 402) throw new Error("Apify's monthly free credit is used up — it resets next billing cycle.");
  if (!res.ok) throw new Error(`Apify transcript run failed (${res.status})`);

  const items = await res.json().catch(() => []);
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) throw new Error("Apify returned no transcript for that video");
  // The actor reports a per-item failure in errMsg rather than failing the
  // run, so a non-empty errMsg with no text is the real error to surface.
  if (!item.text && item.errMsg) throw new Error(String(item.errMsg));

  return { transcript: String(item.text || "").trim(), segments: normalizeSegments(item.segments) };
}
