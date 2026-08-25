// lib/queries/workload.ts
//
// Fetch helper for the Workload pages (EditorWorkloadPage, ScriptingNeedsPage,
// FilmingNeedsPage). A leaner sibling of lib/queries/calendar.ts's fetch —
// only the slices those three views actually read.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";
import type { WeeklyLog } from "@/lib/helpers";
import type { CalendarEntry, Editor } from "@/lib/queries/calendar";
import type { Campaign } from "@/lib/queries/kpi";

export interface WorkloadData {
  entries: CalendarEntry[];
  campaigns: Campaign[];
  brands: string[];
  editors: Editor[];
  weeklyLogs: WeeklyLog[];
}

function mapEntryRow(row: any): CalendarEntry {
  return {
    id: row.id,
    brand: row.brand,
    title: row.title,
    format: row.format || "",
    script: row.script || "",
    date: row.entry_date,
    batch: row.batch,
    status: row.status || "Unscripted",
    editorProfileId: row.editor_profile_id,
    referenceLink: row.reference_link || "",
    rawVideoLink: row.raw_video_link || "",
    finalVideoLink: row.final_video_link || "",
    notes: row.notes || "",
    posted: !!row.posted,
    viewCount: row.view_count || 0,
    bonusLogged: !!row.bonus_logged,
    driveFolderId: row.drive_folder_id || null,
    driveFolderUrl: row.drive_folder_url || null,
    comments: [],
    sortOrder: row.sort_order ?? 0,
    referenceTranscript: row.reference_transcript || null,
    referenceFramework: row.reference_framework || null,
  };
}

export async function fetchWorkloadData(supabase: SupabaseClient, clientId: string): Promise<WorkloadData> {
  const [{ data: entryRows }, { data: campaignRows }, { data: editorRows }, { data: logRows }] = await Promise.all([
    supabase.from("calendar_entries").select("*").eq("client_id", clientId),
    supabase.from("retainer_campaigns").select("*, bonus_tiers(*)").eq("client_id", clientId),
    supabase
      .from("profiles")
      .select("id, name, account_client_access!inner(client_id)")
      .eq("role", "VA/Editor")
      .eq("status", "approved")
      .eq("account_client_access.client_id", clientId),
    supabase.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").eq("client_id", clientId),
  ]);

  const campaigns: Campaign[] = (campaignRows || []).map((row: any) => ({
    id: row.id,
    brand: row.brand,
    rate: row.rate || 0,
    minPosts: row.min_posts || 0,
    maxPosts: row.max_posts || 0,
    sessionCapacity: row.session_capacity || 0,
    bonusTiers: (row.bonus_tiers || []).map((t: any) => ({ id: t.id, views: t.views, bonus: t.bonus })),
  }));

  return {
    entries: (entryRows || []).map(mapEntryRow),
    campaigns,
    brands: Array.from(new Set(campaigns.map((c) => c.brand))),
    editors: (editorRows || []).map((r: any) => ({ id: r.id, name: r.name })),
    weeklyLogs: (logRows || []).map((row) => mapWeeklyLogRow(row as WeeklyLogRow)),
  };
}
