// app/api/socialkit/disconnect/route.ts
//
// "Disconnect" on the Integrations page for SocialKit — deletes the stored
// API key entirely, same shape as /api/drive/disconnect and
// /api/google-calendar/disconnect.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const admin = createAdminSupabaseClient();
  await admin.from("socialkit_connections").delete().eq("client_id", clientId);
  await admin
    .from("integrations")
    .upsert({ client_id: clientId, integration_key: "socialkit", connected: false }, { onConflict: "client_id,integration_key" });

  return NextResponse.json({ ok: true });
}
