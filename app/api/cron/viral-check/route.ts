// app/api/cron/viral-check/route.ts
//
// Scheduled counterpart to the manual "Check now" button — runs the same
// check for every client that has tracked creators.
//
// NOT SCHEDULED YET, on purpose. Two things have to be true first:
//   1. Vercel's Hobby plan caps cron at once per day, which is enough for a
//      24h velocity window but nothing finer.
//   2. Each run spends one SocialKit request per tracked creator, and the
//      free tier is 20/month per client — shared with reference breakdowns.
//      Daily polling of even one creator (30/month) exceeds that, which is
//      why this stays off until the client is on a paid SocialKit tier.
//
// To turn it on, add to vercel.json:
//   { "crons": [{ "path": "/api/cron/viral-check", "schedule": "0 9 * * *" }] }
// and set CRON_SECRET in the Vercel env panel.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runViralCheckForClient, type TrackedCreatorRow } from "@/lib/runViralCheck";

// Sweeps every client with tracked creators, one SocialKit round trip per
// creator; 60s is the Hobby-plan maximum.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel sends the CRON_SECRET as a bearer token. Without this the route
  // is a public endpoint that would let anyone burn every client's SocialKit
  // quota on demand.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  const { data: creators, error } = await admin
    .from("tracked_creators")
    .select("id, client_id, brand, platform, profile_url, handle, viral_threshold");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!creators?.length) return NextResponse.json({ ok: true, clients: 0, hits: 0 });

  const byClient = new Map<string, TrackedCreatorRow[]>();
  creators.forEach((c: any) => {
    const list = byClient.get(c.client_id) || [];
    list.push(c);
    byClient.set(c.client_id, list);
  });

  let totalHits = 0;
  let clientsRun = 0;

  for (const [clientId, list] of byClient) {
    const { data: conn } = await admin.from("socialkit_connections").select("api_key").eq("client_id", clientId).maybeSingle();
    const accessKey = conn?.api_key || process.env.SOCIALKIT_API_KEY;
    if (!accessKey) continue;

    const { data: client } = await admin
      .from("clients")
      .select("id, name, discord_channel_id, discord_webhook_url, viral_alert_channel_id")
      .eq("id", clientId)
      .single();
    if (!client) continue;

    try {
      const result = await runViralCheckForClient(admin, client, list, accessKey);
      totalHits += result.hits.length;
      clientsRun++;
    } catch (err) {
      // One client's run failing must not stop the others.
      console.error("[cron/viral-check] client run failed", clientId, err);
    }
  }

  return NextResponse.json({ ok: true, clients: clientsRun, hits: totalHits });
}
