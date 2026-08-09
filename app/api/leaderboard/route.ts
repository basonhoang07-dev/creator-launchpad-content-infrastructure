// app/api/leaderboard/route.ts
//
// Powers the Leaderboard page for Client + Admin. weekly_logs and
// retainer_campaigns are RLS-locked per client (private.has_client_access) —
// a Client can't read another client's rows directly from the browser, by
// design. Rather than loosening that RLS (which would also expose private
// fields like roadblock/energy_level/wentWell org-wide), this route runs
// server-side with the service-role key and returns only the minimal safe
// shape: rank, name, cash collected this month, and the monthly goal.

import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameMonth } from "@/lib/helpers";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";

export async function GET() {
  const { profile } = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (profile.role !== "Admin" && profile.role !== "Client") {
    return NextResponse.json({ error: "Leaderboard isn't available for your role" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const organizationId = profile.organization_id;

  const { data: clients, error: clientsError } = await admin
    .from("clients")
    .select("id, name, ugc_kpi_goal")
    .eq("organization_id", organizationId);
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  if (!clients || clients.length === 0) return NextResponse.json({ entries: [] });

  const clientIds = clients.map((c) => c.id);

  const [{ data: campaigns, error: campaignsError }, { data: logRows, error: logsError }] = await Promise.all([
    admin.from("retainer_campaigns").select("client_id, rate, max_posts").in("client_id", clientIds),
    admin.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").in("client_id", clientIds),
  ]);
  if (campaignsError) return NextResponse.json({ error: campaignsError.message }, { status: 500 });
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

  const entries = clients
    .map((c) => {
      const monthLogs = ((logRows || []) as (WeeklyLogRow & { client_id: string })[])
        .filter((row) => row.client_id === c.id)
        .map((row) => mapWeeklyLogRow(row))
        .filter((log) => isSameMonth(log.weekOf));

      const cashCollected = monthLogs.reduce((sum, log) => {
        const campaignSum = log.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0);
        return sum + campaignSum + (log.ugcOneOff || 0);
      }, 0);

      const retainerMax = (campaigns || [])
        .filter((camp) => camp.client_id === c.id)
        .reduce((sum, camp) => sum + (camp.rate || 0) * (camp.max_posts || 0) * 30, 0);
      const projectedCash = retainerMax + (c.ugc_kpi_goal || 0);

      return { id: c.id, name: c.name, cashCollected, projectedCash };
    })
    .sort((a, b) => b.cashCollected - a.cashCollected)
    .map((entry, i) => ({ rank: i + 1, ...entry }));

  return NextResponse.json({ entries });
}
