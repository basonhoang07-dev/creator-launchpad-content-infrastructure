// app/api/access-request/route.ts
//
// The login page's "Request access" form used to insert directly into
// access_requests with the anon key — anyone could hammer that endpoint
// with unlimited submissions, since RLS only checks "does this org exist,"
// not "how many times has this email already tried." This route replaces
// that direct insert with the same operation gated by two checks: no
// duplicate pending request for the same email, and a daily cap per email.
// Uses the service-role client because access_requests has no anonymous
// SELECT policy (only Admins can read it) — the throttle checks need to
// read existing rows before deciding whether to allow the insert.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const MAX_REQUESTS_PER_EMAIL_PER_DAY = 3;

export async function POST(req: NextRequest) {
  const { name, email } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are both required." }, { status: 400 });
  }
  const trimmedEmail = email.trim().toLowerCase();

  const admin = createAdminSupabaseClient();

  const { data: org, error: orgError } = await admin.from("organizations").select("id").single();
  if (orgError || !org) {
    return NextResponse.json({ error: "Couldn't reach the organization — try again in a moment." }, { status: 500 });
  }

  // Already has a request sitting unapproved — resubmitting won't speed
  // that up, it just clutters the Admin's queue.
  const { data: pending, error: pendingError } = await admin
    .from("access_requests")
    .select("id")
    .eq("organization_id", org.id)
    .ilike("email", trimmedEmail)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });
  if (pending) {
    return NextResponse.json({ error: "You already have a request waiting on approval — no need to submit again." }, { status: 429 });
  }

  // Daily cap per email regardless of status, to stop repeated
  // submit/deny/resubmit spam from the same address.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .ilike("email", trimmedEmail)
    .gte("created_at", oneDayAgo);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) >= MAX_REQUESTS_PER_EMAIL_PER_DAY) {
    return NextResponse.json({ error: "Too many requests from this email today — try again tomorrow, or reach out to your coach directly." }, { status: 429 });
  }

  const { error: insertError } = await admin.from("access_requests").insert({
    organization_id: org.id,
    name: name.trim(),
    email: trimmedEmail,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
