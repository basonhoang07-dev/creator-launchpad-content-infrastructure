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
import { detectPlatform, getSocialkitKey, type TranscriptSegment } from "@/lib/socialkit";
import { getTranscript } from "@/lib/transcripts";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same ceiling as the breakdown route: a transcript fetch plus a long
// generation runs ~40s, and 60s is the Vercel Hobby maximum.
export const maxDuration = 60;

interface FormatSpec {
  contentFormat?: string;
  title?: string;

  // Who is actually speaking. A transcript arrives as one undifferentiated
  // block, so a two-person call reads identically to a monologue — which is
  // how delivery notes end up telling the creator to perform lines the
  // other person said. Everything downstream is attributed off this.
  cast?: { role?: string; whoTheyAre?: string; isCreator?: boolean }[];
  castNote?: string | null;

  // Why it actually took off. The point of harvesting a format is
  // understanding the mechanism, not copying the surface — and `immutable`
  // is the load-bearing one: the parts that only worked because of who this
  // creator is, which a client borrowing the format cannot reproduce.
  whyItWorks?: {
    visual?: string;
    verbal?: string;
    emotional?: string;
    immutable?: string;
    curiosityLoop?: string;
  };

  // On-camera direction for whoever films it. Separate from the editing
  // steps because it's read before the shoot by a different person — an
  // editor can't fix the wrong outfit or the wrong energy after the fact.
  prep?: string[];
  wardrobe?: string | null;
  setting?: string | null;
  energy?: string | null;
  tonality?: { speaker?: string; section?: string; direction?: string }[];
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

  // Leads the document: whether this format is worth rebuilding at all, and
  // which parts of it are borrowable, is the question to answer before any
  // of the how-to matters.
  const w = spec.whyItWorks || {};
  if (w.visual || w.verbal || w.emotional || w.immutable || w.curiosityLoop) {
    out.push("## Why this went viral", "");
    if (w.visual) out.push(`**Visual:** ${w.visual}`, "");
    if (w.verbal) out.push(`**Verbal:** ${w.verbal}`, "");
    if (w.emotional) out.push(`**Emotional:** ${w.emotional}`, "");
    if (w.curiosityLoop) out.push(`**Curiosity loop:** ${w.curiosityLoop}`, "");
    if (w.immutable) {
      out.push(`**Immutable — what you can't borrow:** ${w.immutable}`, "");
      out.push("_Rebuild the mechanism around something equally true for you. Borrowing a claim you haven't earned is what makes a copy of this format read as fake._", "");
    }
  }

  const cast = (spec.cast || []).filter((c) => c?.role);
  if (cast.length > 1 || spec.castNote) {
    out.push("## Who's on camera", "");
    cast.forEach((c) =>
      out.push(`- **${c.role}**${c.isCreator ? " (the creator — this is the account holder)" : ""}${c.whoTheyAre ? ` — ${c.whoTheyAre}` : ""}`)
    );
    if (cast.length > 0) out.push("");
    if (spec.castNote) out.push(spec.castNote, "");
  }

  section("Prep", bullets(spec.prep));

  // Deliberately unnumbered so the Step 1-5 editing sequence keeps the
  // numbering everyone already knows from the written SOPs. This section is
  // read by whoever is on camera, before any of that applies.
  const tonality = (spec.tonality || []).filter((t) => t?.section && t?.direction);
  if (spec.wardrobe || spec.setting || spec.energy || tonality.length > 0) {
    out.push("## Before you film: look, setting & delivery", "");
    if (spec.wardrobe) out.push(`**Wear:** ${spec.wardrobe}`, "");
    if (spec.setting) out.push(`**Setting & background:** ${spec.setting}`, "");
    if (spec.energy) out.push(`**Overall energy:** ${spec.energy}`, "");
    if (tonality.length > 0) {
      out.push("**How each line should land:**", "");
      // The speaker is named per line rather than assumed, so a two-hander
      // can't be read as one person performing both halves of a
      // conversation.
      tonality.forEach((t) =>
        out.push(`- ${t.speaker ? `**[${t.speaker}]** ` : ""}**${t.section}:** ${t.direction}`)
      );
      out.push("");
    }
  }

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
    .select("id, url, description, thumbnail, views, transcript, transcript_segments, tracked_creators!inner(client_id, handle, brand, platform)")
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

  // Cached on the video row, timings included. calendar_entries only ever
  // held the flat blob, which is useless here — speaker turns are inferred
  // from the pauses — so a cache that keeps the segments is what stops
  // every re-promotion spending another SocialKit request.
  let transcript = ((video as any).transcript || "").trim();
  let segments: TranscriptSegment[] = Array.isArray((video as any).transcript_segments)
    ? (video as any).transcript_segments
    : [];

  // Keyed on the transcript alone, not the segments: Apify's actor returns
  // paragraph-sized chunks, so a cached entry can legitimately have very few
  // segments and must not be re-fetched for that.
  if (!transcript) {
    const key = await getSocialkitKey(clientId);
    try {
      const result = await getTranscript(platform as "tiktok" | "instagram", video.url, key);
      transcript = result.transcript;
      segments = result.segments;
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Couldn't fetch that video's transcript" }, { status: 502 });
    }
    await admin
      .from("tracked_creator_videos")
      .update({ transcript, transcript_segments: segments })
      .eq("id", video.id);

    // Stop here and let the caller come straight back. Fetching a transcript
    // and generating the document each take most of a minute, and together
    // they overran Vercel's 60s function ceiling — the whole request died
    // after the transcript had already been paid for. Splitting it across
    // two invocations keeps each one comfortably inside the limit, and the
    // second finds the transcript cached above, so nothing is fetched twice.
    if (transcript) return NextResponse.json({ warmed: true });
  }
  if (!transcript) {
    return NextResponse.json(
      { error: "That video has no spoken audio to work from — Format SOPs need a talking-style video" },
      { status: 422 }
    );
  }

  // Timestamped lines, with the gap since the previous line marked. A pause
  // is the strongest available signal of a speaker change when there's no
  // diarization, and the timestamps double as something the editor can cue
  // against.
  const timedScript = segments.length
    ? segments
        .map((s, i) => {
          const gap = i === 0 ? 0 : s.start - segments[i - 1].start;
          return `[${s.timestamp}]${gap >= 1 ? " (pause)" : ""} ${s.text}`;
        })
        .join("\n")
    : transcript;

  const prompt = `You're writing a FORMAT SOP for a proven short-form video format. It has two readers: the CREATOR, who films it and needs to know how to look, where to shoot, and how to deliver each line — and the EDITOR, who cuts and captions it. Neither needs to be told how to write a script.

Here is the reference video's transcript, one line per caption segment, with its timestamp. "(pause)" marks a gap of a second or more before that line:
"""
${timedScript}
"""

Caption on the post: ${JSON.stringify(video.description || "")}
Account that posted it: @${creator.handle}
Platform: ${platform}${niche ? `\nNiche: ${niche}` : ""}

STEP 1 — WORK OUT WHO IS TALKING BEFORE ANYTHING ELSE.
The transcript has NO speaker labels. Many of these videos are conversations — two people on a call, an interview, a parent and child, a skit with two characters — and the whole thing reads like a monologue if you don't check. Use second-person address ("guess how much WE made", "I'm proud of YOU"), questions answered by the next line, changes in point of view, and the pause markers to work out the turns. A line where someone is praised, questioned, or given advice was almost certainly said BY THE OTHER PERSON, not by the creator.
Getting this wrong is the single worst failure here: it produces an SOP telling the creator to perform lines somebody else said. If it is genuinely ambiguous, say so in castNote rather than guessing.

THEN decide which speaker is the account holder, and be careful — this is easy to get backwards. People post their OWN good news, not someone else's. The account holder is almost always the person the video FLATTERS: the one reporting the win, hitting the milestone, being praised, congratulated, or asked about their success. The person doing the praising, advising or interviewing is usually the guest, however much they talk. A video is rarely posted by the person handing out the compliments.
Cross-check two things before you commit:
1. The caption is written from the account holder's point of view — see whose experience it describes.
2. Your own answer must be internally consistent. Every line you attribute to the creator has to make sense coming from the same person your "whoTheyAre" describes. If you write that the creator is on a beach, the line "I'm sitting on a beach" must be theirs. Re-read your attribution and fix it before answering.

STEP 2 — you cannot see the video, only hear it. Infer the visual treatment from what is being said, how it is paced, and what the caption implies. Where a call genuinely cannot be made from audio alone, write the instruction so the editor checks it against the reference (for example "match the caption font used in the reference") rather than inventing a specific font, colour or asset that might be wrong. Never name a specific brand, font file, cloud folder or asset library that was not mentioned — say "the approved library" instead.

Produce:
- cast: array of everyone who speaks. Each has "role" (a SHORT label of one to three words, used as a name everywhere else in the document — "Creator", "Dad", "Interviewer", "Friend on the call". Never a description or a sentence; the detail belongs in whoTheyAre), "whoTheyAre" (one line on their relationship to the creator and what they contribute), and "isCreator" (true for exactly one — the person whose account posted this, or the person the video is about if they never speak). If it is genuinely one person, return a single entry.
- castNote: one or two sentences on what a client needs in order to rebuild this — especially if the format REQUIRES a second real person ("this only works with a genuine call from someone who actually knows you; casting a stand-in reads as fake instantly"). null for a straightforward solo piece.
- whyItWorks: an object explaining the mechanism. Be specific to this video, never generic:
  - visual: what the viewer SEES that stops the scroll and keeps them there — the setting, the contrast between setting and subject, what the frame implies about the person's life.
  - verbal: what is said and how it is constructed — word choice, specificity, the shape of the sentences, what is stated versus implied.
  - emotional: what the viewer FEELS and why that makes them stay, save or send it. Name the emotion plainly (envy, pride, relief, vindication, tenderness, aspiration).
  - curiosityLoop: the open loop — what question the opening plants, how long it is held before the payoff, and whether a second loop opens before the first closes. Quote the line that opens it and the line that closes it.
  - immutable: THE MOST IMPORTANT FIELD. What worked here ONLY because of who this specific creator is, and cannot be borrowed by anyone else — their actual revenue number, their age relative to that number, the real relationship on the call, credentials or a track record they have and the viewer doesn't. Be blunt and specific ("a 19-year-old saying 88K lands because of the age-to-number gap; a 35-year-old saying the same number is unremarkable"). Then say what a different creator should put in that slot instead — the equivalent true thing for them.
- contentFormat: a short label for the format itself, the way an editor would name it — for example "Green Screen / Image Overlay Talking Head", "Two-Hander Phone Call", "Static Talking Head + B-roll Cutaways". 3-7 words.
- title: a short name for this SOP (under 60 characters) — name the FORMAT, not this video's specific story, since other creators will rebuild it with their own content.
- prep: 3-5 things to do before filming or opening the editor. If the format needs a second person, say so here first.
- wardrobe: what THE CREATOR (the isCreator person) should WEAR for this format and why it fits the message — be specific about the register (loose vacation fit vs. clean fitted basics vs. gym clothes), and say what to avoid. 1-3 sentences. null only if genuinely nothing about the outfit matters.
- setting: where to shoot it and what the background should signal — the vibe it needs to give off (quiet and expensive, lived-in and real, busy and public, outdoors and free), plus framing and lighting. Say what would break the illusion. 1-3 sentences.
- energy: the overall energy the creator should carry through the whole video in one or two sentences — is this calm and understated, hyped and fast, conspiratorial and quiet, warm and vulnerable? Name it plainly.
- tonality: an array of per-beat delivery directions covering the whole video in order. Each has "speaker" (the exact "role" string from cast — WHO SAYS THIS LINE; never attribute another person's line to the creator), "section" (the beat, e.g. "Hook", "The reveal", or a short quote of the line) and "direction" (how it should land — name the emotional register plainly: sad, excited, deadpan, urgent, calm, amused, conspiratorial; plus pace: slow, fast, normal; plus where to pause or punch a word). 4-6 entries. For a line the creator does not say, write the direction as what the creator should REACT with or elicit, not as something they perform.
- hook: 4-7 instructions for building the opening 3 seconds specifically — what is on screen, how the title text is sized and styled relative to captions, how long it holds, when the first cut lands.
- editing: 5-8 instructions for the main edit pass — clip order, cutting pauses, caption style and word count on screen, when to change visuals, speaker sizing and framing, audio and colour consistency.
- alwaysDo: 8-10 short rules, one line each. Non-negotiables that make an edit match this format.
- avoid: 6-8 short "Don't ..." lines. Concrete mistakes that break this format specifically, not generic editing advice.
- resources: 2-3 lines naming what the editor needs and the review workflow — where assets come from, what to compare the edit against, who reviews before it goes to the client. Do not invent URLs.

Write every list bullet (prep, hook, editing, alwaysDo, avoid, resources) as an imperative instruction under 25 words. wardrobe, setting and energy are short prose, not lists. Be concrete everywhere — "loose linen shirt, no logos" beats "dress casually", "quiet room, warm lamp, no overhead light" beats "good lighting".

Respond with ONLY valid JSON, no markdown fences, no preamble:
{"cast":[{"role":"...","whoTheyAre":"...","isCreator":true}],"castNote":"..." | null,"whyItWorks":{"visual":"...","verbal":"...","emotional":"...","curiosityLoop":"...","immutable":"..."},"contentFormat":"...","title":"...","prep":["..."],"wardrobe":"..." | null,"setting":"..." | null,"energy":"..." | null,"tonality":[{"speaker":"...","section":"...","direction":"..."}],"hook":["..."],"editing":["..."],"alwaysDo":["..."],"avoid":["..."],"resources":["..."]}`;

  // Streamed rather than a plain create: the document now carries the cast
  // breakdown and the five-part viral analysis on top of the editing spec,
  // which lands around 3k tokens. The SDK refuses long non-streaming
  // requests, and streaming also means a slow generation fails on our terms
  // instead of the platform cutting the response mid-flight.
  const message = await anthropic.messages
    .stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();
  const raw = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();

  // The prompt asks for bare JSON, but it also asks for a chunk of reasoning
  // about who is speaking first — and a model that has just been told to
  // reason will sometimes show that work above the object. Slicing to the
  // outermost braces tolerates a preamble (and stray fences) instead of
  // throwing away a perfectly good spec.
  let spec: FormatSpec;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const jsonText = cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1);
  try {
    spec = JSON.parse(jsonText);
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
