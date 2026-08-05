// lib/queries/mappers.ts
//
// Maps snake_case Supabase rows onto the camelCase shapes the ported
// prototype logic (lib/helpers.ts, page components) expects. Keeping the
// mapping in one place means a schema column rename only touches this file.

import type { WeeklyLog, WeeklyLogCampaignEntry } from "@/lib/helpers";

export interface WeeklyLogCampaignEntryRow {
  id: string;
  weekly_log_id: string;
  campaign_brand: string;
  videos_filmed: number | null;
  amount_earned: number | null;
  bonus_earned: number | null;
}

export interface WeeklyLogRow {
  id: string;
  client_id: string;
  week_of: string;
  ugc_one_off: number | null;
  energy_level: number | null;
  went_well: string | null;
  could_improve: string | null;
  deep_work_hours: number | null;
  outreach_sent: number | null;
  outreach_follow_ups: number | null;
  deals_closed: number | null;
  roadblock: string | null;
  roadblock_action: string | null;
  gratitude: string | null;
  next_week_tasks: string | null;
  created_at: string;
  weekly_log_campaign_entries?: WeeklyLogCampaignEntryRow[];
}

export function mapWeeklyLogRow(row: WeeklyLogRow): WeeklyLog {
  return {
    id: row.id,
    weekOf: row.week_of,
    ugcOneOff: row.ugc_one_off || 0,
    energyLevel: row.energy_level,
    wentWell: row.went_well || "",
    couldImprove: row.could_improve || "",
    deepWorkHours: row.deep_work_hours || 0,
    outreachSent: row.outreach_sent || 0,
    outreachFollowUps: row.outreach_follow_ups || 0,
    dealsClosed: row.deals_closed || 0,
    roadblock: row.roadblock || "",
    roadblockAction: row.roadblock_action || "",
    gratitude: row.gratitude || "",
    nextWeekTasks: row.next_week_tasks || "",
    campaignEntries: (row.weekly_log_campaign_entries || []).map(
      (e): WeeklyLogCampaignEntry => ({
        campaignBrand: e.campaign_brand,
        videosFilmed: e.videos_filmed || 0,
        amountEarned: e.amount_earned || 0,
        bonusEarned: e.bonus_earned || 0,
      })
    ),
  };
}
