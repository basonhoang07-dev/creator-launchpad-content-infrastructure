// lib/provisionClient.ts
//
// The one place a real client + Supabase Auth login + profile gets created.
// Shared between approving a self-serve "Request access" submission and the
// Admin's direct "Add client" flow — same account-creation logic either
// way, just triggered from a different starting point.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function provisionClientAccount(
  admin: SupabaseClient,
  organizationId: string,
  name: string,
  email: string,
  origin: string
): Promise<{ ok: true; clientId: string } | { ok: false; status: number; error: string }> {
  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({ organization_id: organizationId, name, google_meet_email: email })
    .select()
    .single();
  if (clientError) return { ok: false, status: 500, error: clientError.message };

  // Without redirectTo, Supabase falls back to whatever "Site URL" is
  // configured in the dashboard — easy to leave stale (e.g. pointed at
  // localhost) and silently send every invite link nowhere useful. Building
  // it from the request's own origin means it's always correct for
  // whichever environment actually sent the invite, dev or production,
  // without needing that dashboard setting kept in sync.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/set-password` });
  if (inviteError || !invited.user) {
    // Don't leave an orphaned client row with no linked account if the
    // invite itself failed.
    await admin.from("clients").delete().eq("id", client.id);
    return { ok: false, status: 502, error: inviteError?.message || "Couldn't send invite" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    organization_id: organizationId,
    client_id: client.id,
    name,
    email,
    role: "Client",
    status: "approved",
    google_meet_email: email,
  });
  if (profileError) return { ok: false, status: 500, error: profileError.message };

  return { ok: true, clientId: client.id };
}
