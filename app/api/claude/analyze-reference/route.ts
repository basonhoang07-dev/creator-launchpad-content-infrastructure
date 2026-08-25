// app/api/claude/analyze-reference/route.ts
//
// Turns a reference Instagram Reel/TikTok URL into a full transcript plus a
// reusable framework breakdown: Variation of Hooks, Intention, Body &
// Context, and Lesson — each with why it creates a curiosity loop into the
// next line, what's locked to the original creator's real story vs what the
// client should swap in as their own, tonality guidance, and wardrobe/
// background guidance.
//
// Two external calls: SocialKit's per-platform Transcript API resolves the
// URL straight to spoken text (no separate video download/ffmpeg step —
// SocialKit handles that itself), then Claude turns that transcript into
// the structured framework.
//
// The SocialKit key is per-client (Integrations → SocialKit), so each
// client's breakdowns come out of their own free-tier quota rather than one
// org-wide paid subscription. SOCIALKIT_API_KEY is an optional org-wide
// fallback for clients who haven't connected their own.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess, checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Measured at ~40s end to end on a real Reel (SocialKit transcript fetch,
// then a 2500-token framework generation). That's close enough to the
// default ceiling that a slower-than-usual Claude response would 504 —
// after SocialKit had already charged the client a request. 60s is the
// Hobby-plan maximum.
export const maxDuration = 60;

function detectPlatform(url: string): "tiktok" | "instagram" | null {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return null;
}

// Read via the service-role client — socialkit_connections is RLS-locked
// with no policies, same as the Google token tables.
async function getSocialkitKey(clientId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("socialkit_connections").select("api_key").eq("client_id", clientId).maybeSingle();
  return data?.api_key || process.env.SOCIALKIT_API_KEY || null;
}

async function fetchTranscript(platform: "tiktok" | "instagram", url: string, accessKey: string): Promise<string> {
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

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  // createInBrand: used by the Breakdown tab — instead of attaching to an
  // existing script, it files the result as a NEW unscripted concept on that
  // brand board, so a reference goes from "link I found" to "concept ready to
  // write" in one action.
  const { clientId, entryId, referenceUrl, createInBrand } = await req.json();
  if (!referenceUrl?.trim()) {
    return NextResponse.json({ error: "No reference URL provided" }, { status: 400 });
  }
  const platform = detectPlatform(referenceUrl);
  if (!platform) {
    return NextResponse.json({ error: "Only Instagram and TikTok links are supported right now" }, { status: 400 });
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const usage = await checkAiUsageCap(supabase, clientId);
  if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status });

  const accessKey = await getSocialkitKey(clientId);
  if (!accessKey) {
    return NextResponse.json(
      { error: "Connect SocialKit under Integrations first — it's free for 20 breakdowns a month." },
      { status: 503 }
    );
  }

  let transcript: string;
  try {
    transcript = await fetchTranscript(platform, referenceUrl, accessKey);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Couldn't fetch that video's transcript" }, { status: 502 });
  }
  if (!transcript) {
    return NextResponse.json({ error: "That video doesn't have any spoken audio to transcribe — this only works on talking-style videos" }, { status: 422 });
  }

  const prompt = `You're breaking down a reference short-form video so a UGC creator can model their own video after it — the goal is understanding WHY it works, not copying it, so they can rebuild the same mechanics with their own real story.

Full transcript of the reference video:
"""
${transcript}
"""

Also give the video a short concept title (under 60 characters) — specific to what this video is actually about, the way a creator would name it on their content board. Not generic like "Reference video".

Break it into exactly these four parts, in this order: "Variation of Hooks", "Intention", "Body & Context", "Lesson".

For each part, give:
- content: the actual line(s) from the transcript covering this part. For "Variation of Hooks" specifically, also identify 2-3 alternate ways to open with the same core angle — different phrasings that would hit the same way.
- curiosityLoop: specifically why this part pulls the viewer into the next line — name the actual retention mechanic at play (open loop, pattern interrupt, specificity, stakes, contrast, etc.), not just "it's interesting"
- immutable: any specific fact, number, or claim in this part that belongs to the ORIGINAL creator's real story and must never be copied as someone else's own claim — e.g. "I made $100k/mo at 17" is immutable because it's a specific personal achievement not everyone has done. null if nothing in this part is creator-specific.
- yourVersion: concrete guidance for what the viewer should swap in with their own real specifics instead, so the structure survives but the content is theirs
- tonality: how to deliver this part vocally to actually land it — pace, emphasis, energy, where to slow down or punch a word
- visual: wardrobe, background, framing, or setting guidance relevant to this specific part, if there's anything distinct to call out — null if it's the same as the rest of the video

Respond with ONLY valid JSON, no markdown fences, no preamble. Exact shape:
{"title":"...","parts":[{"part":"Variation of Hooks","content":"...","curiosityLoop":"...","immutable":"..." | null,"yourVersion":"...","tonality":"...","visual":"..." | null},{"part":"Intention","content":"...","curiosityLoop":"...","immutable":"..." | null,"yourVersion":"...","tonality":"...","visual":"..." | null},{"part":"Body & Context","content":"...","curiosityLoop":"...","immutable":"..." | null,"yourVersion":"...","tonality":"...","visual":"..." | null},{"part":"Lesson","content":"...","curiosityLoop":"...","immutable":"..." | null,"yourVersion":"...","tonality":"...","visual":"..." | null}]}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();

  let parsed: { title?: string; parts: unknown };
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Claude returned malformed JSON — try again" }, { status: 502 });
  }

  await logAiUsage(supabase, clientId, "analyze-reference");

  if (entryId) {
    const { error } = await supabase
      .from("calendar_entries")
      .update({ reference_transcript: transcript, reference_framework: parsed.parts })
      .eq("id", entryId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ transcript, framework: parsed.parts });
  }

  if (createInBrand) {
    // Same bottom-of-the-board placement new scripts get everywhere else.
    const { data: last } = await supabase
      .from("calendar_entries")
      .select("sort_order")
      .eq("client_id", clientId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("calendar_entries")
      .insert({
        client_id: clientId,
        brand: createInBrand,
        title: (parsed.title || "Reference breakdown").slice(0, 120),
        format: "",
        script: "",
        status: "Unscripted",
        entry_date: null,
        reference_link: referenceUrl,
        reference_transcript: transcript,
        reference_framework: parsed.parts,
        notes: "Created from a reference breakdown — the framework below is the structure to rebuild with your own story.",
        posted: false,
        view_count: 0,
        bonus_logged: false,
        sort_order: (last?.sort_order ?? 0) + 1,
      })
      .select("id, title")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ transcript, framework: parsed.parts, entry: created });
  }

  return NextResponse.json({ transcript, framework: parsed.parts, title: parsed.title });
}
