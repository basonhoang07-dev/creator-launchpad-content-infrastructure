// app/api/claude/analyze-reference/route.ts
//
// Turns a reference Instagram Reel/TikTok URL into a full transcript plus a
// reusable framework breakdown across four beats (Variation of Hooks,
// Intention, Body & Context, Lesson), each as two columns: a plug-and-play
// fill-in-the-blank skeleton, and why that beat works.
//
// What to swap, what to wear, and how to say each part are collected ONCE at
// the end (whatToChange + delivery) rather than repeated per beat — the
// per-beat table stays scannable while writing, and the delivery notes are
// what you read right before filming.
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
import { detectPlatform, getSocialkitKey, fetchTranscript } from "@/lib/socialkit";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Measured at ~40s end to end on a real Reel (SocialKit transcript fetch,
// then a 2500-token framework generation). That's close enough to the
// default ceiling that a slower-than-usual Claude response would 504 —
// after SocialKit had already charged the client a request. 60s is the
// Hobby-plan maximum.
export const maxDuration = 60;

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

For each part give exactly two things:
- framework: the PLUG-AND-PLAY template for this beat. Write it as a fill-in-the-blank skeleton the creator can drop their own specifics into, with placeholders in [square brackets] — e.g. "You're going to be the [aspirational identity] that [specific outcome] every [timeframe]". Strip out the original creator's personal numbers and claims; the skeleton is what transfers, not their story. For "Variation of Hooks", give 2-3 alternate openings built on the same skeleton, one per line.
- explanation: why this beat works — name the actual retention mechanic (open loop, pattern interrupt, specificity, stakes, contrast, identity projection, etc.) and what it does to the viewer. Plain language, 1-3 sentences.

Then, separately and only ONCE for the whole video:
- whatToChange: a short list (3-6 items) of exactly what this creator must swap to make it their own. Call out any number, claim, or credential that belongs to the original creator and can't be borrowed — e.g. "I made $100k/mo at 17" can't be reused by someone who hasn't — and say what to put there instead.
- delivery.wardrobe: what to wear for THIS specific video and why it fits the message. null if genuinely nothing matters here.
- delivery.setting: background, framing, and lighting for this video. null if nothing specific matters.
- delivery.tonality: an array of per-section delivery directions. For each, "section" is which beat it applies to (use the part names above, or a short phrase quoting the line) and "direction" is how to actually say it — name the emotional register plainly (sad, excited, deadpan, urgent, calm, conspiratorial) plus pace (slow, fast, normal) and where to pause or punch a word.

Respond with ONLY valid JSON, no markdown fences, no preamble. Exact shape:
{"title":"...","parts":[{"part":"Variation of Hooks","framework":"...","explanation":"..."},{"part":"Intention","framework":"...","explanation":"..."},{"part":"Body & Context","framework":"...","explanation":"..."},{"part":"Lesson","framework":"...","explanation":"..."}],"whatToChange":["...","..."],"delivery":{"wardrobe":"..." | null,"setting":"..." | null,"tonality":[{"section":"...","direction":"..."}]}}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();

  let parsed: { title?: string; parts: unknown; whatToChange?: unknown; delivery?: unknown };
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Claude returned malformed JSON — try again" }, { status: 502 });
  }

  // Stored as one object rather than a bare parts array: the delivery notes
  // and what-to-change list apply to the video as a whole, not per beat.
  const breakdown = {
    parts: Array.isArray(parsed.parts) ? parsed.parts : [],
    whatToChange: Array.isArray(parsed.whatToChange) ? parsed.whatToChange : [],
    delivery: (parsed.delivery as any) || { wardrobe: null, setting: null, tonality: [] },
  };

  await logAiUsage(supabase, clientId, "analyze-reference");

  if (entryId) {
    const { error } = await supabase
      .from("calendar_entries")
      .update({ reference_transcript: transcript, reference_framework: breakdown })
      .eq("id", entryId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ transcript, framework: breakdown });
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
        reference_framework: breakdown,
        notes: "Created from a reference breakdown — the framework below is the structure to rebuild with your own story.",
        posted: false,
        view_count: 0,
        bonus_logged: false,
        sort_order: (last?.sort_order ?? 0) + 1,
      })
      .select("id, title")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ transcript, framework: breakdown, entry: created });
  }

  return NextResponse.json({ transcript, framework: breakdown, title: parsed.title });
}
