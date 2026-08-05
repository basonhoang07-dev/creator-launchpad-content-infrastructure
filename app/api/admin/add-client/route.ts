// app/api/admin/add-client/route.ts
//
// The direct path: an Admin who already knows a client's name and email
// creates their account immediately — no self-serve "Request access" form
// needed first. Same underlying provisioning as approving a request
// (lib/provisionClient) — just skips waiting on them to submit one.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { provisionClientAccount } from "@/lib/provisionClient";

export async function POST(req: NextRequest) {
  const { name, email } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const result = await provisionClientAccount(admin, profile.organization_id, name.trim(), email.trim(), req.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, clientId: result.clientId });
}
