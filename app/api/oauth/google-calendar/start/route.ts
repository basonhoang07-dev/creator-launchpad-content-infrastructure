// app/api/oauth/google-calendar/start/route.ts
//
// Kicks off "Connect Google Calendar" from the Integrations page. Mirrors
// /api/oauth/google/start (Drive) exactly, just against the Calendar scope —
// see lib/google-calendar.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { buildAuthUrl, calendarOAuthConfigured } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  if (!calendarOAuthConfigured()) {
    return NextResponse.json({ error: "Google Calendar isn't set up on this server yet — ask your Admin to add GOOGLE_OAUTH_CLIENT_ID/SECRET." }, { status: 500 });
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const redirectUri = `${req.nextUrl.origin}/api/oauth/google-calendar/callback`;
  return NextResponse.redirect(buildAuthUrl(redirectUri, clientId));
}
