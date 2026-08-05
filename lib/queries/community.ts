// lib/queries/community.ts
//
// Computes the Admin-only Community Overview from real per-client data
// (weekly_logs + retainer_campaigns + clients), per the decision to derive
// it live instead of porting the prototype's hand-maintained `data.community`
// mock. "This cycle" / "this month" mirrors HomePage's own goal-math
// (retainerMax = sum(rate * maxPosts * 30) + ugcKpi.goal).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekKey, isSameMonth, isWeekActuallyLogged, monthlyIncomeHistory } from "@/lib/helpers";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";
import type { TrendPoint } from "@/components/charts";

export interface CommunityClient {
  id: string;
  name: string;
  contractedCash: number;
  otherEarnings: number;
  monthlyGoal: number;
  videosFilmed: number;
  dealsClosed: number;
  status: "Ahead" | "On track" | "Behind";
  checkedInThisWeek: boolean;
}

export interface CommunityData {
  monthlyHistory: TrendPoint[];
  clients: CommunityClient[];
}

export async function fetchCommunityOverview(supabase: SupabaseClient, organizationId: string): Promise<CommunityData> {
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, ugc_kpi_goal")
    .eq("organization_id", organizationId);

  if (!clients || clients.length === 0) return { monthlyHistory: [], clients: [] };

  const clientIds = clients.map((c) => c.id);

  const [{ data: campaigns }, { data: logRows }] = await Promise.all([
    supabase.from("retainer_campaigns").select("client_id, rate, max_posts").in("client_id", clientIds),
    supabase.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").in("client_id", clientIds),
  ]);

  const logsByClient = new Map<string, ReturnType<typeof mapWeeklyLogRow>[]>();
  ((logRows || []) as (WeeklyLogRow & { client_id: string })[]).forEach((row) => {
    const log = mapWeeklyLogRow(row);
    const list = logsByClient.get(row.client_id) || [];
    list.push(log);
    logsByClient.set(row.client_id, list);
  });

  const allLogs = (logRows || []).map((row) => mapWeeklyLogRow(row as WeeklyLogRow));
  const monthlyHistory = monthlyIncomeHistory(allLogs);

  const currentWeekKey = getWeekKey();

  const communityClients: CommunityClient[] = clients.map((c) => {
    const logs = logsByClient.get(c.id) || [];
    const monthLogs = logs.filter((l) => isSameMonth(l.weekOf));

    const contractedCash = monthLogs.reduce(
      (sum, l) => sum + l.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0),
      0
    );
    const otherEarnings = monthLogs.reduce((sum, l) => sum + (l.ugcOneOff || 0), 0);
    const videosFilmed = monthLogs.reduce((sum, l) => sum + l.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0), 0);
    const dealsClosed = monthLogs.reduce((sum, l) => sum + (l.dealsClosed || 0), 0);

    const clientCampaigns = (campaigns || []).filter((camp) => camp.client_id === c.id);
    const retainerMax = clientCampaigns.reduce((sum, camp) => sum + (camp.rate || 0) * (camp.max_posts || 0) * 30, 0);
    const monthlyGoal = retainerMax + (c.ugc_kpi_goal || 0);

    const thisWeekLog = logs.find((l) => l.weekOf === currentWeekKey);
    const total = contractedCash + otherEarnings;
    const goalPct = monthlyGoal > 0 ? (total / monthlyGoal) * 100 : 0;
    const status: CommunityClient["status"] = goalPct >= 100 ? "Ahead" : goalPct >= 70 ? "On track" : "Behind";

    return {
      id: c.id,
      name: c.name,
      contractedCash,
      otherEarnings,
      monthlyGoal,
      videosFilmed,
      dealsClosed,
      status,
      checkedInThisWeek: isWeekActuallyLogged(thisWeekLog),
    };
  });

  return { monthlyHistory, clients: communityClients };
}
