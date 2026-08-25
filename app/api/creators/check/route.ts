// app/api/creators/check/route.ts
//
// The manual "Check now" button. Spends exactly one SocialKit request per
// tracked creator, which is why it's user-triggered rather than automatic on
// the free tier (20 requests/month, shared with reference breakdowns) — see
// app/api/cron/viral-check for the scheduled version.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runViralCheckForClient, type TrackedCreatorRow } from "@/lib/runViralCheck";

// One SocialKit round trip per tracked creator, run in sequence — a client
// watching several creators adds up fast. 60s is the Hobby-plan maximum.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const admin = createAdminSupabaseClient();
  const { data: conn } = await admin.from("socialkit_connections").select("api_key").eq("client_id", clientId).maybeSingle();
  const accessKey = conn?.api_key || process.env.SOCIALKIT_API_KEY;
  if (!accessKey) {
    return NextResponse.json(
      { error: "Connect SocialKit under Integrations first — it's free for 20 checks a month." },
      { status: 503 }
    );
  }

  const { data: creators, error: creatorsError } = await supabase
    .from("tracked_creators")
    .select("id, brand, platform, profile_url, handle, viral_threshold")
    .eq("client_id", clientId);
  if (creatorsError) return NextResponse.json({ error: creatorsError.message }, { status: 500 });
  if (!creators?.length) return NextResponse.json({ checked: 0, hits: [], errors: [] });

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, discord_channel_id, discord_webhook_url")
    .eq("id", clientId)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const result = await runViralCheckForClient(supabase, client, creators as TrackedCreatorRow[], accessKey);

  // Every creator failing with the same message means it's the key or the
  // quota, not the profiles — surface that as a real error instead of a
  // "checked 0, all good" that hides it.
  if (result.checked === 0 && result.errors.length > 0) {
    return NextResponse.json({ error: result.errors[0].replace(/^@[^:]+:\s*/, "") }, { status: 502 });
  }

  return NextResponse.json(result);
}
