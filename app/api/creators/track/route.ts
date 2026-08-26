// app/api/creators/track/route.ts
//
// Add (POST) or remove (DELETE) a creator being watched for Viral Alerts.
// Adding stores no snapshot — the first "Check now" establishes the
// baseline, so nothing here spends a SocialKit request.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { parseCreatorInput, VIRAL_THRESHOLD_MIN } from "@/lib/viralAlerts";

export async function POST(req: NextRequest) {
  const { clientId, brand, platform, input, threshold } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  if (platform !== "tiktok" && platform !== "instagram") {
    return NextResponse.json({ error: "Pick TikTok or Instagram" }, { status: 400 });
  }

  const parsed = parseCreatorInput(input || "", platform);
  if (!parsed) return NextResponse.json({ error: "Paste a profile link or @handle" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const { data, error } = await supabase
    .from("tracked_creators")
    .insert({
      client_id: clientId,
      brand: brand || null,
      platform,
      profile_url: parsed.profileUrl,
      handle: parsed.handle,
      // Enforced as a floor, not a default — a smaller number can't be
      // saved, so a low-traffic creator's ordinary post can never trip an
      // alert.
      viral_threshold: Math.max(Number(threshold) || VIRAL_THRESHOLD_MIN, VIRAL_THRESHOLD_MIN),
    })
    .select()
    .single();

  if (error) {
    // The unique(client_id, platform, profile_url) constraint is the common
    // failure here and reads as gibberish raw.
    if (error.code === "23505") {
      return NextResponse.json({ error: `@${parsed.handle} is already being tracked.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ creator: data });
}

export async function DELETE(req: NextRequest) {
  const { clientId, creatorId } = await req.json();
  if (!clientId || !creatorId) return NextResponse.json({ error: "Missing clientId or creatorId" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { error } = await access.supabase.from("tracked_creators").delete().eq("id", creatorId).eq("client_id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
