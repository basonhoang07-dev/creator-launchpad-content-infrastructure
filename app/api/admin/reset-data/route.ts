// app/api/admin/reset-data/route.ts
//
// Backs the Admin Panel's Danger Zone. The prototype's "reset to defaults"
// wiped an in-memory blob and could safely include accounts, since nothing
// there was real. Here, accounts are real Supabase Auth users — deleting
// your own admin account mid-request (or every teammate's login) is not an
// equivalent action, so this route intentionally only wipes CONTENT data
// for the organization's clients (scripts, campaigns, weekly logs,
// availability, templates, brand profiles, recaps, SOPs, integrations,
// announcements) and leaves organizations/clients/profiles/access grants
// untouched. Requires the service-role key since it's a full-organization
// wipe that must not depend on RLS being correctly configured yet.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const organizationId = profile.organization_id;

  const { data: clients, error: clientsError } = await admin.from("clients").select("id").eq("organization_id", organizationId);
  if (clientsError) return NextResponse.json({ error: `Reset aborted before touching anything: ${clientsError.message}` }, { status: 500 });
  const clientIds = (clients || []).map((c) => c.id);

  // A destructive, all-or-nothing action reporting ok:true has to mean every
  // step actually happened — Promise.all alone doesn't guarantee that, since
  // Supabase calls resolve with {error} instead of throwing. Collect and
  // check every result explicitly so a partial failure is reported as a
  // failure, not silently swallowed as a "successful" reset.
  const failures: string[] = [];
  const track = (label: string, result: { error: { message: string } | null }) => {
    if (result.error) failures.push(`${label}: ${result.error.message}`);
  };

  if (clientIds.length > 0) {
    const results = await Promise.all([
      admin.from("calendar_entries").delete().in("client_id", clientIds),
      admin.from("retainer_campaigns").delete().in("client_id", clientIds),
      admin.from("weekly_logs").delete().in("client_id", clientIds),
      admin.from("availability_blocks").delete().in("client_id", clientIds),
      admin.from("templates").delete().in("client_id", clientIds),
      admin.from("brand_profiles").delete().in("client_id", clientIds),
      admin.from("recaps").delete().in("client_id", clientIds),
      admin.from("integrations").delete().in("client_id", clientIds),
      admin.from("clients").update({ ugc_kpi_goal: 0, ugc_kpi_rate_per_deal: 0, ugc_kpi_closing_rate: 0, ugc_kpi_response_rate: 0 }).in("id", clientIds),
    ]);
    const labels = ["calendar_entries", "retainer_campaigns", "weekly_logs", "availability_blocks", "templates", "brand_profiles", "recaps", "integrations", "clients KPI reset"];
    results.forEach((r, i) => track(labels[i], r));
  }

  // calendar_trash mirrors deleted calendar_entries but has no client_id column
  // of its own (original_entry is a jsonb snapshot) — match on the org's clients instead.
  const { data: trashRows, error: trashReadError } = await admin.from("calendar_trash").select("id, original_entry");
  if (trashReadError) {
    failures.push(`calendar_trash read: ${trashReadError.message}`);
  } else {
    const trashIdsForOrg = (trashRows || []).filter((r) => clientIds.includes((r.original_entry as any)?.client_id)).map((r) => r.id);
    if (trashIdsForOrg.length > 0) {
      track("calendar_trash delete", await admin.from("calendar_trash").delete().in("id", trashIdsForOrg));
    }
  }

  track("sops", await admin.from("sops").delete().eq("organization_id", organizationId));
  track("announcements", await admin.from("announcements").delete().eq("organization_id", organizationId));

  if (failures.length > 0) {
    return NextResponse.json({ error: `Reset partially failed — some data may remain: ${failures.join("; ")}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
