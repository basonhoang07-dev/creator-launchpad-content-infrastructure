// app/api/oauth/google-calendar/callback/route.ts
//
// Google redirects here after the client approves (or denies) the consent
// screen from /api/oauth/google-calendar/start. Mirrors the Drive callback
// exactly — exchanges the code for tokens, stores them, marks 'gcal' connected.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const redirectBack = new URL("/integrations", req.nextUrl.origin);

  if (oauthError) {
    redirectBack.searchParams.set("gcal_error", "Google Calendar connection cancelled.");
    return NextResponse.redirect(redirectBack);
  }
  if (!code || !clientId) {
    redirectBack.searchParams.set("gcal_error", "Google didn't return the expected response — try connecting again.");
    return NextResponse.redirect(redirectBack);
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) {
    redirectBack.searchParams.set("gcal_error", "You're not authorized to connect Calendar for that client.");
    return NextResponse.redirect(redirectBack);
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/oauth/google-calendar/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      throw new Error("Google didn't grant offline access — try connecting again.");
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    const expiresAtIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminSupabaseClient();
    await admin.from("google_calendar_connections").upsert(
      {
        client_id: clientId,
        google_email: email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: expiresAtIso,
      },
      { onConflict: "client_id" }
    );
    await admin
      .from("integrations")
      .upsert({ client_id: clientId, integration_key: "gcal", connected: true, connected_email: email }, { onConflict: "client_id,integration_key" });

    redirectBack.searchParams.set("gcal_connected", email);
  } catch (err) {
    redirectBack.searchParams.set("gcal_error", err instanceof Error ? err.message : "Couldn't connect Google Calendar — try again.");
  }
  return NextResponse.redirect(redirectBack);
}
