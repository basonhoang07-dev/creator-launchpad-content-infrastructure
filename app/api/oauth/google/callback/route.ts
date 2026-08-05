// app/api/oauth/google/callback/route.ts
//
// Google redirects here after the client approves (or denies) the consent
// screen from /api/oauth/google/start. Exchanges the code for tokens, stores
// them, and marks the 'drive' integration connected.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/google-drive";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clientId = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const redirectBack = new URL("/integrations", req.nextUrl.origin);

  if (oauthError) {
    // Most commonly "access_denied" — the client backed out of the consent
    // screen. Not a failure worth alarming anyone over.
    redirectBack.searchParams.set("drive_error", "Google Drive connection cancelled.");
    return NextResponse.redirect(redirectBack);
  }
  if (!code || !clientId) {
    redirectBack.searchParams.set("drive_error", "Google didn't return the expected response — try connecting again.");
    return NextResponse.redirect(redirectBack);
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) {
    redirectBack.searchParams.set("drive_error", "You're not authorized to connect Drive for that client.");
    return NextResponse.redirect(redirectBack);
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/oauth/google/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      // Shouldn't happen with prompt=consent, but if it does we have no way
      // to stay connected past the first access-token expiry — surface it
      // instead of silently storing a connection that'll quietly die in ~1hr.
      throw new Error("Google didn't grant offline access — try connecting again.");
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    const expiresAtIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminSupabaseClient();
    await admin.from("google_drive_connections").upsert(
      {
        client_id: clientId,
        google_email: email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: expiresAtIso,
        root_folder_id: null,
      },
      { onConflict: "client_id" }
    );
    await admin
      .from("integrations")
      .upsert({ client_id: clientId, integration_key: "drive", connected: true, connected_email: email }, { onConflict: "client_id,integration_key" });

    redirectBack.searchParams.set("drive_connected", email);
  } catch (err) {
    redirectBack.searchParams.set("drive_error", err instanceof Error ? err.message : "Couldn't connect Google Drive — try again.");
  }
  return NextResponse.redirect(redirectBack);
}
