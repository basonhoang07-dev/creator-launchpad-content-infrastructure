// app/api/leads/capture/route.ts
//
// The public funnel posts here. It is the only unauthenticated write in the
// app, so it validates hard and returns the destination rather than
// promising an email.
//
// Why it returns the URL instead of the funnel knowing it: the destination
// changes per campaign and gets swapped when the offer changes, and the
// funnel is a static file on Netlify that has to be redeployed to change
// anything. Sending it back with the response means the lead magnet can be
// switched from the admin panel without touching that repo again.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { validateEmailShape, validatePhone, validateName, domainAcceptsMail } from "@/lib/leadValidation";

// The funnel is served from its own domain, so this is genuinely
// cross-origin. Listed explicitly rather than "*" — an open endpoint that
// writes rows is an invitation to fill the call sheet with noise.
const ALLOWED_ORIGINS = [
  "https://creatorlaunchpad.netlify.app",
  "https://www.creatorlaunchpad.netlify.app",
];

function cors(origin: string | null): Record<string, string> {
  // A Netlify deploy preview gets its own subdomain per build, and blocking
  // those would mean the funnel can never be tested before it goes live.
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(origin))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get("origin"));
  const body = await req.json().catch(() => ({}));

  const name = validateName(body.first_name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400, headers });

  const email = validateEmailShape(body.email);
  if (!email.ok) return NextResponse.json({ error: email.error }, { status: 400, headers });

  const phone = validatePhone(body.phone);
  if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400, headers });

  // Last, because it's the only check that costs a round trip — no point
  // paying for DNS on a submission the shape rules already rejected.
  if (!(await domainAcceptsMail(email.normalized!))) {
    return NextResponse.json(
      { error: "We couldn't find that email's domain — check the spelling?" },
      { status: 400, headers }
    );
  }

  const admin = createAdminSupabaseClient();

  // Single-org for now, same assumption the rest of the app makes.
  const { data: org } = await admin.from("organizations").select("id, lead_magnet_url").limit(1).maybeSingle();
  if (!org) return NextResponse.json({ error: "Not accepting signups right now." }, { status: 503, headers });

  const sourceSlug = typeof body.source === "string" ? body.source.trim().slice(0, 60) : null;

  // A named source can point somewhere of its own; otherwise everyone lands
  // on the org default.
  let destination = org.lead_magnet_url || null;
  if (sourceSlug) {
    const { data: source } = await admin
      .from("lead_sources")
      .select("destination_url")
      .eq("organization_id", org.id)
      .eq("slug", sourceSlug)
      .maybeSingle();
    if (source?.destination_url) destination = source.destination_url;
  }

  const { error } = await admin.from("leads").upsert(
    {
      organization_id: org.id,
      first_name: name.normalized,
      email: email.normalized,
      phone: phone.normalized,
      instagram_handle: typeof body.instagram_handle === "string" ? body.instagram_handle.trim().slice(0, 60) : null,
      ugc_goal: typeof body.ugc_goal === "string" ? body.ugc_goal.slice(0, 120) : null,
      experience_level: typeof body.experience_level === "string" ? body.experience_level.slice(0, 120) : null,
      biggest_blocker: typeof body.biggest_blocker === "string" ? body.biggest_blocker.slice(0, 120) : null,
      followers_band: typeof body.followers_band === "string" ? body.followers_band.slice(0, 60) : null,
      source_slug: sourceSlug,
      landing_url: typeof body.landing_url === "string" ? body.landing_url.slice(0, 500) : null,
    },
    // Someone redoing the quiz to get the link again is the common case, not
    // an abuse — update what they told us rather than making a second row
    // for the same person. Their stage and notes are left alone, because a
    // resubmission shouldn't wipe what a caller wrote.
    { onConflict: "organization_id,email", ignoreDuplicates: false }
  );

  if (error) {
    return NextResponse.json({ error: "Something went wrong — try again." }, { status: 500, headers });
  }

  return NextResponse.json({ success: true, redirectUrl: destination }, { headers });
}
