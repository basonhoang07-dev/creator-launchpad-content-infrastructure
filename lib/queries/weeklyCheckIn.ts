// lib/queries/weeklyCheckIn.ts
//
// Save helper for the Weekly Check-In wizard. Ported logic from the
// prototype's `finish()`: upserts the week's log row, then fully replaces
// its campaign-entry rows (simplest correct way to reconcile an edited set
// against whatever was there before, same pattern used for SOP images).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WeeklyLogFormEntry {
  campaignBrand: string;
  videosFilmed: string | number;
  amountEarned: string | number;
  bonusEarned: string | number;
}

export interface WeeklyLogFormFields {
  campaignEntries: WeeklyLogFormEntry[];
  ugcOneOff: string | number;
  energyLevel: number | null;
  wentWell: string;
  couldImprove: string;
  deepWorkHours: string | number;
  outreachSent: string | number;
  outreachFollowUps: string | number;
  dealsClosed: string | number;
  roadblock: string;
  roadblockAction: string;
  gratitude: string;
  nextWeekTasks: string;
}

export async function saveWeeklyLog(supabase: SupabaseClient, clientId: string, weekKey: string, editingLogId: string | null, fields: WeeklyLogFormFields) {
  const row = {
    client_id: clientId,
    week_of: weekKey,
    ugc_one_off: Number(fields.ugcOneOff) || 0,
    energy_level: fields.energyLevel === null ? null : Number(fields.energyLevel),
    went_well: fields.wentWell,
    could_improve: fields.couldImprove,
    deep_work_hours: Number(fields.deepWorkHours) || 0,
    outreach_sent: Number(fields.outreachSent) || 0,
    outreach_follow_ups: Number(fields.outreachFollowUps) || 0,
    deals_closed: Number(fields.dealsClosed) || 0,
    roadblock: fields.roadblock,
    roadblock_action: fields.roadblockAction,
    gratitude: fields.gratitude,
    next_week_tasks: fields.nextWeekTasks,
  };

  let logId = editingLogId;
  if (logId) {
    const { error } = await supabase.from("weekly_logs").update(row).eq("id", logId);
    if (error) throw error;
    await supabase.from("weekly_log_campaign_entries").delete().eq("weekly_log_id", logId);
  } else {
    const { data, error } = await supabase.from("weekly_logs").insert(row).select().single();
    if (error) throw error;
    logId = data.id;
  }

  const entries = fields.campaignEntries
    .map((e) => ({
      weekly_log_id: logId,
      campaign_brand: e.campaignBrand,
      videos_filmed: Number(e.videosFilmed) || 0,
      amount_earned: Number(e.amountEarned) || 0,
      bonus_earned: Number(e.bonusEarned) || 0,
    }))
    // Only persist rows with real content — an all-zero row for a campaign the
    // client didn't touch this week is just noise.
    .filter((e) => e.videos_filmed > 0 || e.amount_earned > 0 || e.bonus_earned > 0);

  if (entries.length > 0) {
    const { error } = await supabase.from("weekly_log_campaign_entries").insert(entries);
    if (error) throw error;
  }

  return logId!;
}
