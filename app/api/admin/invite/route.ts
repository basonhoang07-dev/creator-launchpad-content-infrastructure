// app/api/admin/invite/route.ts
//
// Invites a new VA/Editor or Creative Director into real Supabase Auth.
// This categorically requires the service-role key (auth.admin.* isn't
// available with the anon key) — see lib/supabase/admin.ts.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { name, email, role } = await req.json();

  if (role !== "VA/Editor" && role !== "Creative Director") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email.trim(), { redirectTo: `${req.nextUrl.origin}/set-password` });
  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message || "Couldn't send invite" }, { status: 502 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    organization_id: profile.organization_id,
    name: name.trim(),
    email: email.trim(),
    role,
    status: "approved",
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
