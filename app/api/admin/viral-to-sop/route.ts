// app/api/admin/viral-to-sop/route.ts
//
// Turns a viral alert into a Format SOP — the step that makes the whole
// pipeline worth having. Discovery (Viral Alerts) and distribution (Format
// SOPs) already existed but never touched: a breakdown run on a viral video
// stayed buried in whichever client's script it came from, so the same
// format had to be re-analysed for every client in that niche.
//
// Reuses the existing breakdown engine rather than a second prompt, so an
// SOP says exactly what the client sees on their own script. If the video
// has already been broken down anywhere, that cached result is used and no
// API credit is spent.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Renders the structured breakdown as SOP markdown. Kept close to how the
// Breakdown tab lays it out — plug-and-play skeleton first, then why it
// works, then what to change and how to shoot it.
function breakdownToSopBody(breakdown: any, sourceUrl: string, handle: string, niche: string | null): string {
  const parts = Array.isArray(breakdown?.parts) ? breakdown.parts : [];
  const whatToChange = Array.isArray(breakdown?.whatToChange) ? breakdown.whatToChange : [];
  const delivery = breakdown?.delivery || {};
  const tonality = Array.isArray(delivery.tonality) ? delivery.tonality : [];

  const lines: string[] = [];
  lines.push(`**Source:** [@${handle}'s reel](${sourceUrl})${niche ? ` · **Niche:** ${niche}` : ""}`);
  lines.push("");
  lines.push("This format is proven — it crossed the viral threshold in a real campaign. Rebuild it with your own story; don't copy the specifics.");
  lines.push("");

  parts.forEach((p: any) => {
    lines.push(`## ${p.part}`);
    lines.push("");
    lines.push("**Plug & play**");
    lines.push("");
    lines.push(p.framework || "");
    lines.push("");
    lines.push(`**Why it works:** ${p.explanation || ""}`);
    lines.push("");
  });

  if (whatToChange.length) {
    lines.push("## Change this to make it yours");
    lines.push("");
    whatToChange.forEach((c: string) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (delivery.wardrobe || delivery.setting || tonality.length) {
    lines.push("## How to shoot it");
    lines.push("");
    if (delivery.wardrobe) lines.push(`**Wear:** ${delivery.wardrobe}`);
    if (delivery.setting) lines.push(`**Setting:** ${delivery.setting}`);
    if (delivery.wardrobe || delivery.setting) lines.push("");
    tonality.forEach((t: any) => lines.push(`- **${t.section}:** ${t.direction}`));
  }

  return lines.join("\n").trim();
}

export async function POST(req: NextRequest) {
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
    .select("id, url, description, thumbnail, views, alerted_velocity, tracked_creators!inner(client_id, handle, brand)")
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

  // Reuse an existing breakdown of this exact video if one exists anywhere in
  // the org — re-analysing costs a SocialKit request and an AI credit for a
  // result we already have.
  const { data: cached } = await admin
    .from("calendar_entries")
    .select("title, reference_transcript, reference_framework")
    .eq("reference_link", video.url)
    .not("reference_framework", "is", null)
    .limit(1)
    .maybeSingle();

  let breakdown = cached?.reference_framework as any;
  let title = cached?.title as string | undefined;

  if (!breakdown) {
    // No cached analysis — run the same route the Breakdown tab uses, so the
    // prompt can never drift between the two.
    const res = await fetch(new URL("/api/claude/analyze-reference", req.nextUrl.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
      body: JSON.stringify({ clientId, referenceUrl: video.url }),
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ error: json.error || "Couldn't break that video down" }, { status: 502 });
    breakdown = json.framework;
    title = json.title;
  }

  if (!breakdown?.parts?.length) {
    return NextResponse.json({ error: "The breakdown came back empty — try again" }, { status: 502 });
  }

  const sopTitle = (title || video.description || `@${creator.handle} format`).slice(0, 120);

  const { data: sop, error: sopError } = await admin
    .from("sops")
    .insert({
      organization_id: profile.organization_id,
      kind: "format",
      title: sopTitle,
      body: breakdownToSopBody(breakdown, video.url, creator.handle || "creator", niche),
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
