// app/api/oauth/google/start/route.ts
//
// Kicks off "Connect Google Drive" from the Integrations page. Redirects to
// Google's consent screen; the client's own Google account is what ends up
// authorizing (and owning the storage for) the folders this app creates —
// see lib/google-drive.ts for why that matters.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { buildAuthUrl, driveOAuthConfigured } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  if (!driveOAuthConfigured()) {
    return NextResponse.json({ error: "Google Drive isn't set up on this server yet — ask your Admin to add GOOGLE_OAUTH_CLIENT_ID/SECRET." }, { status: 500 });
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const redirectUri = `${req.nextUrl.origin}/api/oauth/google/callback`;
  // state carries the clientId through Google's redirect — the callback
  // re-runs requireClientAccess against it using the real session cookie,
  // so a tampered state can't grant access it wouldn't already have.
  return NextResponse.redirect(buildAuthUrl(redirectUri, clientId));
}
