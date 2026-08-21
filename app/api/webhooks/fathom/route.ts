// app/api/webhooks/fathom/route.ts
//
// Receives Fathom's "new meeting content ready" webhook and turns it into a
// recap automatically — no human has to open the app. This is the automation
// the manual "New Recap" modal (components/recaps/NewRecapModal.tsx) and
// lib/generateRecap.ts were both already written to anticipate.
//
// Setup (do this once you have a public URL, e.g. after deploying — Fathom
// can't reach localhost):
//   1. Fathom Settings → API Access → generate an API key (not used here,
//      but required before webhooks can be created).
//   2. Create a webhook (dashboard, or POST /webhooks per Fathom's API) with
//      destination_url = https://<your-domain>/api/webhooks/fathom and
//      include_transcript = true. Fathom returns a `secret` (starts with
//      "whsec_") at creation time — put that in FATHOM_WEBHOOK_SECRET.
//   3. For each client, make sure clients.google_meet_email is set to the
//      email Fathom will see as a call invitee (Admin Panel → per-client
//      recap settings) — that's how a webhook call gets matched to a client
//      portal, same rule as the manual modal's email-match check.
//
// Fathom signs requests the same way Svix does: webhook-id / webhook-
// timestamp / webhook-signature headers, HMAC-SHA256 over
// "{id}.{timestamp}.{raw body}" using the base64-decoded secret (after
// stripping "whsec_"). See https://developers.fathom.ai/webhooks.
//
// The exact payload field names below (calendar_invitees, transcript,
// share_url, etc.) are Fathom's documented meeting-object shape as of when
// this was written — if Fathom sends something these extractors don't
// recognize, the route no-ops instead of crashing (see extractors below),
// so worst case is "nothing happened," not a 500. Check the real payload
// via Fathom's "send test webhook" button and adjust extractInviteeEmails/
// extractTranscript/extractMeta if field names differ.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateRecapFromTranscript } from "@/lib/generateRecap";
import { matchesClientMeetEmail } from "@/lib/queries/recaps";
import { checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { deliverRecap } from "@/lib/recapDelivery";
import { verifyFathomSignature, extractInviteeEmails, extractTranscript, extractMeta } from "@/lib/fathomWebhook";
import { isAnthropicConfigured } from "@/lib/anthropicStatus";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyFathomSignature(rawBody, req.headers, process.env.FATHOM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Ack rather than error — a real Anthropic key not being configured yet
  // isn't something Fathom retrying will fix, and a non-2xx here just makes
  // Fathom keep re-sending the same call.
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ ok: true, skipped: "AI features not configured yet" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inviteeEmails = extractInviteeEmails(payload);
  const transcript = extractTranscript(payload);
  const { title, recordingUrl, callDate } = extractMeta(payload);

  // Ack (200) rather than error on unusable payloads — this is expected for
  // meetings Fathom sends that aren't a coaching call, and returning an error
  // here would make Fathom keep retrying forever.
  if (!transcript.trim() || inviteeEmails.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no transcript or invitees" });
  }

  const admin = createAdminSupabaseClient();

  const { data: clients, error: clientsError } = await admin
    .from("clients")
    .select("id, name, google_meet_email, discord_webhook_url, discord_channel_id")
    .not("google_meet_email", "is", null);
  if (clientsError) {
    console.error("[fathom webhook] clients lookup failed", clientsError);
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }
  let matchedEmail: string | null = null;
  const client = (clients || []).find((c) => inviteeEmails.some((email) => matchesClientMeetEmail(email, c.google_meet_email) && (matchedEmail = email)));

  if (!client) {
    return NextResponse.json({ ok: true, skipped: "no client matched invitee emails" });
  }

  const usage = await checkAiUsageCap(admin, client.id);
  if (!usage.ok) return NextResponse.json({ ok: true, skipped: usage.error });

  let parsed;
  try {
    parsed = await generateRecapFromTranscript(transcript, client.name, callDate);
  } catch {
    return NextResponse.json({ error: "Recap generation failed" }, { status: 502 });
  }
  await logAiUsage(admin, client.id, "webhook-fathom-recap");

  const { data: recap, error } = await admin
    .from("recaps")
    .insert({
      client_id: client.id,
      title: parsed.title || title || "Call recap",
      recap_date: callDate,
      attendee_email: matchedEmail,
      tldr: parsed.tldr,
      recording_url: recordingUrl,
      transcript,
      source: "auto",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.actionItems?.length) {
    await admin.from("recap_action_items").insert(parsed.actionItems.map((item) => ({ recap_id: recap.id, body: item.body, due: item.due, done: false })));
  }
  if (parsed.decisions?.length) {
    await admin.from("recap_decisions").insert(parsed.decisions.map((text) => ({ recap_id: recap.id, body: text })));
  }

  await deliverRecap(client, recap, parsed);

  return NextResponse.json({ ok: true, recapId: recap.id });
}
