// app/api/admin/viral-to-sop/route.ts
//
// Turns a viral alert into a Format SOP — the step that makes the whole
// pipeline worth having. Discovery (Viral Alerts) and distribution (Format
// SOPs) already existed but never touched: a proven format stayed buried in
// whichever client's board it fired on, so the same format had to be
// re-found for every other client in that niche.
//
// A Format SOP here is an EDITOR-facing production spec, not a scripting
// framework — it follows the house structure already used in the written
// SOPs (Content Format / Reference Video / Prep / The Hook / Basic editing /
// Always Do These / Avoid These / Approved Resources). That's a different
// document from the Breakdown tab's four-beat script framework, which is why
// this has its own prompt rather than reusing that route's output.
//
// The transcript is the only real signal available — nobody here watches the
// video — so anything visual is inferred from what's said and how it's
// paced. The prompt is told to write those calls as "check this against the
// reference" rather than invent a font or asset, and the SOP itself carries
// a line saying so, matching the "(Inferred Standard)" convention in the
// hand-written ones.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { detectPlatform, getSocialkitKey, fetchTranscript } from "@/lib/socialkit";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same ceiling as the breakdown route: a transcript fetch plus a long
// generation runs ~40s, and 60s is the Vercel Hobby maximum.
export const maxDuration = 60;

interface FormatSpec {
  contentFormat?: string;
  title?: string;
  prep?: string[];
  hook?: string[];
  editing?: string[];
  alwaysDo?: string[];
  avoid?: string[];
  resources?: string[];
}

function bullets(items: unknown): string[] {
  return Array.isArray(items) ? items.filter((i): i is string => typeof i === "string" && i.trim().length > 0) : [];
}

// Renders the spec as markdown in the house structure. A section with
// nothing in it is dropped rather than left as an empty heading.
function specToSopBody(spec: FormatSpec, sourceUrl: string, handle: string, niche: string | null, platform: string): string {
  const out: string[] = [];
  const section = (heading: string, items: string[]) => {
    if (items.length === 0) return;
    out.push(`## ${heading}`, "");
    items.forEach((i) => out.push(`- ${i}`));
    out.push("");
  };

  out.push(`**Content Format:** ${spec.contentFormat || "Talking head"}`);
  out.push(`**Reference Video:** [@${handle} on ${platform === "tiktok" ? "TikTok" : "Instagram"}](${sourceUrl})`);
  if (niche) out.push(`**Niche:** ${niche}`);
  out.push("");
  out.push("This format is proven — it crossed the viral threshold on a tracked creator. Rebuild the structure with your own story; don't copy their specifics.");
  out.push("");
  out.push("_The visual and editing calls below are inferred from the reference's audio and pacing. Watch the reference video and confirm them before briefing an editor._");
  out.push("");

  section("Prep", bullets(spec.prep));
  section("Step 1: The Hook", bullets(spec.hook));
  section("Step 2: Basic editing", bullets(spec.editing));
  section("Step 3: Always Do These", bullets(spec.alwaysDo));
  section("Step 4: Avoid These Common Mistakes", bullets(spec.avoid));
  section("Step 5: Approved Resources", [`Primary reference: ${sourceUrl}`, ...bullets(spec.resources)]);

  return out.join("\n").trim();
}

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { clientId, videoId } = await req.json();
  if (!clientId || !videoId) {
    return NextResponse.json({ error: "Missing clientId or videoId" }, { status: 400 });
  }

  // Cross-client by nature — this reads one client's alert and publishes to
  // the whole org, so it's Admin-only rather than client-scoped.
  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();

  const { data: video, error: videoError } = await admin
    .from("tracked_creator_videos")
    .select("id, url, description, thumbnail, views, tracked_creators!inner(client_id, handle, brand, platform)")
    .eq("id", videoId)
    .single();
  if (videoError || !video) return NextResponse.json({ error: "That alert no longer exists" }, { status: 404 });

  const creator: any = (video as any).tracked_creators;
  if (creator?.client_id !== clientId) {
    return NextResponse.json({ error: "That alert doesn't belong to the given client" }, { status: 400 });
  }
  if (!video.url) return NextResponse.json({ error: "That alert has no video link to break down" }, { status: 400 });

  const { data: campaign } = await admin
    .from("retainer_campaigns")
    .select("niche")
    .eq("client_id", clientId)
    .eq("brand", creator.brand || "")
    .maybeSingle();
  const niche: string | null = campaign?.niche ?? null;

  // Promoting the same alert twice is an easy double-click, and a duplicate
  // Format SOP is worse than none — hand back the existing one instead of
  // creating a second copy (and instead of paying for another breakdown).
  const { data: existing } = await admin
    .from("sops")
    .select("id, title")
    .eq("organization_id", profile.organization_id)
    .eq("kind", "format")
    .eq("reference_video_link", video.url)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return NextResponse.json({ sop: existing, alreadyExisted: true });

  const platform = detectPlatform(video.url) || creator.platform || "instagram";

  // Prefer a transcript already fetched for this exact video — SocialKit's
  // free tier is 20 requests a month, and re-fetching one we already have
  // spends a request for nothing.
  const { data: cached } = await admin
    .from("calendar_entries")
    .select("reference_transcript")
    .eq("reference_link", video.url)
    .not("reference_transcript", "is", null)
    .limit(1)
    .maybeSingle();

  let transcript = (cached?.reference_transcript || "").trim();
  if (!transcript) {
    const key = await getSocialkitKey(clientId);
    if (!key) {
      return NextResponse.json(
        { error: "That client hasn't connected SocialKit — connect it under Integrations to pull transcripts." },
        { status: 400 }
      );
    }
    try {
      transcript = await fetchTranscript(platform as "tiktok" | "instagram", video.url, key);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Couldn't fetch that video's transcript" }, { status: 502 });
    }
  }
  if (!transcript) {
    return NextResponse.json(
      { error: "That video has no spoken audio to work from — Format SOPs need a talking-style video" },
      { status: 422 }
    );
  }

  const prompt = `You're writing a FORMAT SOP: an editing spec a video editor follows to reproduce a proven short-form format. The reader is an editor, not a scriptwriter — they need to know how to cut, caption and assemble the video, not how to write one.

Here is the reference video's full transcript:
"""
${transcript}
"""

Caption on the post: ${JSON.stringify(video.description || "")}
Creator: @${creator.handle}
Platform: ${platform}${niche ? `\nNiche: ${niche}` : ""}

IMPORTANT: you cannot see the video, only hear it. Infer the visual treatment from what is being said, how it is paced, and what the caption implies. Where a call genuinely cannot be made from audio alone, write the instruction so the editor checks it against the reference (for example "match the caption font used in the reference") rather than inventing a specific font, colour or asset that might be wrong. Never name a specific brand, font file, cloud folder or asset library that was not mentioned — say "the approved library" instead.

Produce:
- contentFormat: a short label for the format itself, the way an editor would name it — for example "Green Screen / Image Overlay Talking Head", "Static Talking Head + B-roll Cutaways", "POV Skit with Text Overlay". 3-7 words.
- title: a short name for this SOP (under 60 characters) — name the FORMAT, not this video's specific story, since other creators will rebuild it with their own content.
- prep: 3-5 things to do before opening the editor — watch the reference, gather assets, note the structure.
- hook: 4-7 instructions for building the opening 3 seconds specifically — what is on screen, how the title text is sized and styled relative to captions, how long it holds, when the first cut lands.
- editing: 5-8 instructions for the main edit pass — clip order, cutting pauses, caption style and word count on screen, when to change visuals, speaker sizing and framing, audio and colour consistency.
- alwaysDo: 8-12 short rules, one line each. Non-negotiables that make an edit match this format.
- avoid: 6-10 short "Don't ..." lines. Concrete mistakes that break this format specifically, not generic editing advice.
- resources: 2-4 lines naming what the editor needs and the review workflow — where assets come from, what to compare the edit against, who reviews before it goes to the client. Do not invent URLs.

Write every bullet as an imperative instruction. Keep each under 25 words.

Respond with ONLY valid JSON, no markdown fences, no preamble:
{"contentFormat":"...","title":"...","prep":["..."],"hook":["..."],"editing":["..."],"alwaysDo":["..."],"avoid":["..."],"resources":["..."]}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();

  let spec: FormatSpec;
  try {
    spec = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Claude returned malformed JSON — try again" }, { status: 502 });
  }
  if (bullets(spec.alwaysDo).length === 0 && bullets(spec.editing).length === 0) {
    return NextResponse.json({ error: "The format spec came back empty — try again" }, { status: 502 });
  }

  const sopTitle = (spec.title || spec.contentFormat || `@${creator.handle} format`).slice(0, 120);

  const { data: sop, error: sopError } = await admin
    .from("sops")
    .insert({
      organization_id: profile.organization_id,
      kind: "format",
      title: sopTitle,
      body: specToSopBody(spec, video.url, creator.handle || "creator", niche, platform),
      author_name: profile.name,
      author_role: profile.role,
      thumbnail_url: video.thumbnail,
      reference_video_link: video.url,
    })
    .select("id, title")
    .single();
  if (sopError) return NextResponse.json({ error: sopError.message }, { status: 500 });

  return NextResponse.json({ sop });
}
