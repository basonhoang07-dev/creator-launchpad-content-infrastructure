// app/api/extension/save/route.ts
//
// "Save this one" from the extension while you're scrolling.
//
// Two destinations, because there are two reasons you stop on a video. If
// it's from a creator you already track, it belongs with that creator's
// videos — it's evidence about someone you're watching. If it's from
// anyone else, it's a reference you want to write against, so it lands on
// the content calendar as an unscripted concept with the link attached,
// ready for the Breakdown tab.
//
// Nothing here fetches from Instagram or TikTok. The extension sends what
// the page already showed it, so saving costs no API quota and works on a
// video our scrapers can't reach.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { clientForExtensionToken, corsHeaders } from "@/lib/extensionAuth";
import { detectPlatform } from "@/lib/socialkit";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  const client = await clientForExtensionToken(req.headers.get("x-extension-token"));
  if (!client) {
    return NextResponse.json({ error: "Not connected — paste your key into the extension." }, { status: 401, headers });
  }

  const body = await req.json().catch(() => ({}));
  const url: string = String(body.url || "").trim();
  const handle: string = String(body.handle || "").toLowerCase().replace(/^@/, "");
  const caption: string = String(body.caption || "").trim();
  const views: number = Number(body.views) || 0;
  const thumbnail: string | null = body.thumbnail ? String(body.thumbnail) : null;

  if (!url) return NextResponse.json({ error: "No video link" }, { status: 400, headers });

  const platform = detectPlatform(url);
  if (!platform) {
    return NextResponse.json({ error: "Only Instagram and TikTok links work here" }, { status: 400, headers });
  }

  const admin = createAdminSupabaseClient();

  // Already tracking this creator? Then this is evidence about them, and it
  // belongs alongside the rest of their videos rather than as a loose
  // reference.
  const { data: creator } = handle
    ? await admin
        .from("tracked_creators")
        .select("id, handle")
        .eq("client_id", client.id)
        .eq("platform", platform)
        .ilike("handle", handle)
        .maybeSingle()
    : { data: null };

  if (creator) {
    // videoId is what the reconcile pass keys on, so a saved video has to
    // use the same identity the scraper would give it or the next check
    // will insert a duplicate.
    const videoId = url.replace(/\/+$/, "").split("/").pop() || url;
    const { error } = await admin.from("tracked_creator_videos").upsert(
      {
        tracked_creator_id: creator.id,
        video_id: videoId,
        url,
        description: caption || null,
        thumbnail,
        views,
        // Saved by hand, so it counts as seen now. Left un-alerted: a human
        // saving something isn't the same as it crossing the threshold, and
        // marking it alerted would put it in the Viral Feed under a
        // velocity nobody measured.
        checked_at: new Date().toISOString(),
      },
      { onConflict: "tracked_creator_id,video_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });

    return NextResponse.json({ saved: "creator", creator: creator.handle }, { headers });
  }

  // Otherwise it's a reference to write against. Filed on the client's first
  // board as an unscripted concept — the Breakdown tab picks it up from the
  // reference link.
  const { data: board } = await admin
    .from("retainer_campaigns")
    .select("brand")
    .eq("client_id", client.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // brand is NOT NULL on calendar_entries, and a client with no board yet
  // still needs somewhere for a save to land rather than a 500 they can't
  // act on.
  if (!board?.brand) {
    return NextResponse.json(
      { error: "You don't have a brand board yet — make one in the Content Calendar first." },
      { status: 400, headers }
    );
  }

  const { error } = await admin.from("calendar_entries").insert({
    client_id: client.id,
    brand: board.brand,
    title: caption ? caption.slice(0, 120) : `Reference from @${handle || platform}`,
    // Matches the casing the rest of the app writes, so a saved reference
    // groups with everything else in the Unscripted column instead of
    // forming a status of its own.
    status: "Unscripted",
    reference_link: url,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });

  return NextResponse.json({ saved: "reference", board: board.brand }, { headers });
}
