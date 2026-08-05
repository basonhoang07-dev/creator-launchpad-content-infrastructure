// app/api/admin/approve-request/route.ts
//
// The ONLY place a real Supabase Auth account gets created from a public
// "Request access" submission — the login page's request form only ever
// inserts a row into access_requests (see db/schema.sql), never touches
// auth.users directly. This route creates the client record, invites the
// real login (service-role key, same as app/api/admin/invite), and links
// the profile — all in one Admin-triggered action.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { provisionClientAccount } from "@/lib/provisionClient";

export async function POST(req: NextRequest) {
  const { requestId } = await req.json();
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();

  const { data: request, error: requestError } = await admin.from("access_requests").select("*").eq("id", requestId).single();
  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
  if (!request || request.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Request not found in your organization" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "This request was already handled" }, { status: 400 });
  }

  const result = await provisionClientAccount(admin, profile.organization_id, request.name, request.email, req.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await admin.from("access_requests").update({ status: "approved" }).eq("id", requestId);

  return NextResponse.json({ ok: true });
}
