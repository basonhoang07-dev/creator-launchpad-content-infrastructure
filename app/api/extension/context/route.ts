// app/api/extension/context/route.ts
//
// What the extension needs to know while you're scrolling: which creators
// this client tracks, and which of their videos have already taken off.
//
// One call rather than two, because the content script asks on every page
// change — the answer to "am I looking at someone I track" has to be there
// before the reel finishes loading, or the badge appears after you've
// scrolled past.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { clientForExtensionToken, corsHeaders } from "@/lib/extensionAuth";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  const client = await clientForExtensionToken(req.headers.get("x-extension-token"));
  if (!client) {
    return NextResponse.json({ error: "Not connected — paste your key into the extension." }, { status: 401, headers });
  }

  const admin = createAdminSupabaseClient();

  const { data: creators } = await admin
    .from("tracked_creators")
    .select("handle, platform, brand, viral_threshold")
    .eq("client_id", client.id);

  // Only videos that actually alerted. The extension uses this to mark a
  // reel you're looking at as one that already crossed the threshold, so
  // "should I model this" is answered without opening the app.
  const { data: alerted } = await admin
    .from("tracked_creator_videos")
    .select("url, views, alerted_velocity, tracked_creators!inner(client_id)")
    .eq("tracked_creators.client_id", client.id)
    .not("alerted_at", "is", null)
    .limit(200);

  return NextResponse.json(
    {
      client: { name: client.name },
      creators: (creators || []).map((c: any) => ({
        handle: (c.handle || "").toLowerCase().replace(/^@/, ""),
        platform: c.platform,
        brand: c.brand,
        threshold: Number(c.viral_threshold) || 10000,
      })),
      alertedUrls: (alerted || []).map((v: any) => v.url).filter(Boolean),
    },
    { headers }
  );
}
