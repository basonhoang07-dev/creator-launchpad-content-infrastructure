// lib/queries/home.ts
//
// Fetches and maps the slice of real data the Home page needs, replacing the
// prototype's single `data` blob read from window.storage. Each page fetches
// only what it renders (per lib/supabase.ts's guidance), not everything.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";
import type { WeeklyLog } from "@/lib/helpers";

export interface HomeCalendarEntry {
  id: string;
  brand: string;
  title: string;
  format: string | null;
  script: string;
  date: string | null;
  status: string;
  editorProfileId: string | null;
}

export interface HomeCampaign {
  id: string;
  brand: string;
  rate: number;
  minPosts: number;
  maxPosts: number;
  sessionCapacity: number;
}

export interface HomeRecap {
  id: string;
  title: string;
  date: string;
  actionItems: { id: string; body: string; done: boolean }[];
}

export interface HomeIntegration {
  id: string; // integration_key
  connected: boolean;
}

export interface HomeClient {
  id: string;
  name: string;
  ugcKpiGoal: number;
}

export interface HomeData {
  client: HomeClient;
  calendar: HomeCalendarEntry[];
  weeklyLogs: WeeklyLog[];
  retainerCampaigns: HomeCampaign[];
  brands: string[];
  recaps: HomeRecap[];
  integrations: HomeIntegration[];
}

export async function fetchHomeData(supabase: SupabaseClient, clientId: string): Promise<HomeData> {
  const [
    { data: clientRow },
    { data: calendarRows },
    { data: logRows },
    { data: campaignRows },
    { data: recapRows },
    { data: integrationRows },
  ] = await Promise.all([
    supabase.from("clients").select("id, name, ugc_kpi_goal").eq("id", clientId).single(),
    supabase
      .from("calendar_entries")
      .select("id, brand, title, format, script, entry_date, status, editor_profile_id")
      .eq("client_id", clientId),
    supabase.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").eq("client_id", clientId),
    supabase.from("retainer_campaigns").select("id, brand, rate, min_posts, max_posts, session_capacity").eq("client_id", clientId),
    supabase.from("recaps").select("id, title, recap_date, recap_action_items(id, body, done)").eq("client_id", clientId),
    supabase.from("integrations").select("integration_key, connected").eq("client_id", clientId),
  ]);

  const calendar: HomeCalendarEntry[] = (calendarRows || []).map((c) => ({
    id: c.id,
    brand: c.brand,
    title: c.title,
    format: c.format,
    script: c.script || "",
    date: c.entry_date,
    status: c.status || "Unscripted",
    editorProfileId: c.editor_profile_id,
  }));

  const weeklyLogs: WeeklyLog[] = (logRows || []).map((row) => mapWeeklyLogRow(row as WeeklyLogRow));

  const retainerCampaigns: HomeCampaign[] = (campaignRows || []).map((c) => ({
    id: c.id,
    brand: c.brand,
    rate: c.rate || 0,
    minPosts: c.min_posts || 0,
    maxPosts: c.max_posts || 0,
    sessionCapacity: c.session_capacity || 0,
  }));

  const brands = Array.from(new Set(retainerCampaigns.map((c) => c.brand)));

  const recaps: HomeRecap[] = (recapRows || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    date: r.recap_date,
    actionItems: (r.recap_action_items || []).map((a: any) => ({ id: a.id, body: a.body, done: a.done })),
  }));

  const integrations: HomeIntegration[] = (integrationRows || []).map((i) => ({ id: i.integration_key, connected: i.connected }));

  return {
    client: { id: clientRow?.id || clientId, name: clientRow?.name || "", ugcKpiGoal: clientRow?.ugc_kpi_goal || 0 },
    calendar,
    weeklyLogs,
    retainerCampaigns,
    brands,
    recaps,
    integrations,
  };
}
