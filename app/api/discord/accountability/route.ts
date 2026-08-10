// app/api/discord/accountability/route.ts
//
// Posts a summary of a just-submitted Weekly Check-In to one shared,
// org-wide Discord channel (DISCORD_ACCOUNTABILITY_CHANNEL_ID) — replaces
// the previous Google Form + Zapier ("accountability EOD for CL") chain.
// Re-fetches the log server-side from logId rather than trusting whatever
// the client posts, so the numbers in the Discord post always match what's
// actually saved in weekly_logs, never a value someone could tamper with
// client-side.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { buildAccountabilityEmbed } from "@/lib/discord";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";
import { formatWeekLabel } from "@/lib/helpers";

export async function POST(req: NextRequest) {
  const { clientId, logId } = await req.json();
  if (!clientId || !logId) return NextResponse.json({ error: "Missing clientId or logId" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_ACCOUNTABILITY_CHANNEL_ID;
  if (!botToken || !channelId) return NextResponse.json({ ok: true, skipped: "not configured" });

  const [{ data: client }, { data: logRow, error: logError }] = await Promise.all([
    supabase.from("clients").select("name").eq("id", clientId).single(),
    supabase.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").eq("id", logId).single(),
  ]);
  if (logError || !logRow || !client) return NextResponse.json({ ok: true, skipped: "log or client not found" });

  const log = mapWeeklyLogRow(logRow as WeeklyLogRow);
  const videosFilmed = log.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0);
  const cashThisWeek = log.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0) + (log.ugcOneOff || 0);

  const embed = buildAccountabilityEmbed({
    clientName: client.name,
    weekLabel: formatWeekLabel(log.weekOf),
    energyLevel: log.energyLevel,
    wentWell: log.wentWell,
    couldImprove: log.couldImprove,
    roadblock: log.roadblock,
    roadblockAction: log.roadblockAction,
    videosFilmed,
    cashThisWeek,
    dealsClosed: log.dealsClosed || 0,
    outreachSent: log.outreachSent || 0,
    nextWeekTasks: log.nextWeekTasks,
  });

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) console.error("[accountability] Discord bot post failed", res.status, await res.text());
  } catch (err) {
    console.error("[accountability] Discord bot post failed", err);
  }

  return NextResponse.json({ ok: true });
}
