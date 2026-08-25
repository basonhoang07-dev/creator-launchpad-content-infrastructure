// app/api/claude/generate-recap/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess, checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { generateRecapFromTranscript } from "@/lib/generateRecap";
import { deliverRecap } from "@/lib/recapDelivery";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

// Claude generation over a full call transcript can run long; 60s is the
// Hobby-plan maximum.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { clientId, transcript, callDate, recordingUrl } = await req.json();

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  if (!transcript?.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  // Fetched fresh rather than trusted from the request body — this is also
  // what deliverRecap needs (discord_webhook_url, google_meet_email) to fan
  // the recap out to the client's channel/email once it's saved.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, google_meet_email, discord_webhook_url, discord_channel_id")
    .eq("id", clientId)
    .single();
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const usage = await checkAiUsageCap(supabase, clientId);
  if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status });

  let parsed;
  try {
    parsed = await generateRecapFromTranscript(transcript, client.name, callDate);
  } catch {
    return NextResponse.json({ error: "Couldn't generate the recap — try again in a moment" }, { status: 502 });
  }

  await logAiUsage(supabase, clientId, "generate-recap");

  const { data: recap, error } = await supabase
    .from("recaps")
    .insert({
      client_id: clientId,
      title: parsed.title,
      recap_date: callDate,
      tldr: parsed.tldr,
      recording_url: recordingUrl || null,
      transcript,
      source: "manual",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.actionItems?.length) {
    await supabase.from("recap_action_items").insert(
      parsed.actionItems.map((item) => ({ recap_id: recap.id, body: item.body, due: item.due, done: false }))
    );
  }
  if (parsed.decisions?.length) {
    await supabase.from("recap_decisions").insert(
      parsed.decisions.map((text) => ({ recap_id: recap.id, body: text }))
    );
  }

  await deliverRecap(client, recap, parsed);

  return NextResponse.json({ recap });
}
