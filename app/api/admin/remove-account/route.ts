// app/api/admin/remove-account/route.ts
//
// Removes an account for real: deletes the profile row AND the underlying
// Supabase Auth user (auth.admin.deleteUser — categorically requires the
// service-role key). Replaces the earlier client-side-only removeAccount,
// which only deleted the profile row and left a orphaned-but-still-valid
// login behind. Deletes the profile first, then the auth user, since
// `profiles.id` references `auth.users(id)` with no ON DELETE CASCADE.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { accountId } = await req.json();
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (accountId === profile.id) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: target, error: targetError } = await admin.from("profiles").select("id, role, organization_id").eq("id", accountId).single();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target || target.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Account not found in your organization" }, { status: 404 });
  }
  if (target.role === "Admin") {
    return NextResponse.json({ error: "Can't remove another Admin account this way" }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").delete().eq("id", accountId);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(accountId);
  if (authError) {
    // Profile is already gone (they can't reach any portal), but surface this
    // so it's visible in logs — the auth user is now orphaned, not dangerous.
    return NextResponse.json({ ok: true, warning: `Profile removed, but the login itself couldn't be deleted: ${authError.message}` });
  }

  return NextResponse.json({ ok: true });
}
