// app/api/socialkit/connect/route.ts
//
// Saves a client's own SocialKit API key, powering "Break down this
// reference" on a script. Unlike Drive/Calendar this isn't OAuth —
// SocialKit only issues plain API keys — so the client pastes theirs from
// socialkit.dev and it's stored server-side in socialkit_connections
// (RLS-locked, service-role reads only; see the migration).
//
// Deliberately does NOT validate the key by calling SocialKit here: every
// request counts against the free tier's 20/month, and burning one on a
// connect check is a real cost to the client. A bad key instead surfaces as
// an explicit "key was rejected — reconnect" message the first time a
// breakdown runs (see app/api/claude/analyze-reference).

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { clientId, apiKey } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  if (!apiKey?.trim()) return NextResponse.json({ error: "Paste your SocialKit API key first" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("socialkit_connections")
    .upsert({ client_id: clientId, api_key: apiKey.trim() }, { onConflict: "client_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirrors the Drive/Calendar callbacks: the integrations row is what the
  // Integrations page reads to show connected state, the credential itself
  // lives in the locked-down table.
  await admin
    .from("integrations")
    .upsert({ client_id: clientId, integration_key: "socialkit", connected: true }, { onConflict: "client_id,integration_key" });

  return NextResponse.json({ ok: true });
}
