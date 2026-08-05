// lib/fathomWebhook.ts
//
// Pure, testable pieces of the Fathom webhook handler (app/api/webhooks/
// fathom/route.ts) — signature verification and payload parsing. Split out
// so the crypto and field-extraction logic can be covered by real unit
// tests instead of only trusting a live payload we may never see until
// Fathom actually calls the endpoint.

import crypto from "crypto";

// Fathom signs requests the same way Svix does: webhook-id / webhook-
// timestamp / webhook-signature headers, HMAC-SHA256 over
// "{id}.{timestamp}.{raw body}" using the base64-decoded secret (after
// stripping "whsec_"). See https://developers.fathom.ai/webhooks.
export function verifyFathomSignature(rawBody: string, headers: Pick<Headers, "get">, secret: string | undefined, now: number = Date.now()): boolean {
  if (!secret) return false;

  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const ageSeconds = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  return signatureHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

// Signs a payload the same way, for tests and for generating a real "send
// test webhook" style request if we ever need to poke the endpoint by hand.
export function signFathomPayload(rawBody: string, secret: string, id: string, timestamp: string): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  return `v1,${crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64")}`;
}

// The exact payload field names below (calendar_invitees, transcript,
// share_url, etc.) are Fathom's documented meeting-object shape as of when
// this was written — if Fathom sends something these don't recognize, they
// return empty rather than throwing, so the route no-ops instead of
// crashing. Check the real payload via Fathom's "send test webhook" button
// and adjust here if field names differ.
function meetingOf(payload: any): any {
  return payload?.meeting || payload?.data?.meeting || payload || {};
}

export function extractInviteeEmails(payload: any): string[] {
  const meeting = meetingOf(payload);
  const invitees = meeting.calendar_invitees || meeting.invitees || meeting.attendees || [];
  return (Array.isArray(invitees) ? invitees : [])
    .map((inv: any) => (typeof inv === "string" ? inv : inv?.email))
    .filter((e: any): e is string => typeof e === "string" && e.trim().length > 0);
}

export function extractTranscript(payload: any): string {
  const meeting = meetingOf(payload);
  const transcript = meeting.transcript;
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((turn: any) => {
        const speaker = turn?.speaker?.name || turn?.speaker || "";
        const text = turn?.text || turn?.message || "";
        return speaker ? `${speaker}: ${text}` : text;
      })
      .join("\n")
      .trim();
  }
  const summary = meeting.summary;
  if (typeof summary === "string") return summary;
  return summary?.markdown_formatted || "";
}

export function extractMeta(payload: any): { title: string | null; recordingUrl: string | null; callDate: string } {
  const meeting = meetingOf(payload);
  const rawDate = meeting.scheduled_start_time || meeting.recording_start_time || meeting.created_at;
  const callDate = typeof rawDate === "string" ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return {
    title: meeting.title || meeting.meeting_title || null,
    recordingUrl: meeting.share_url || meeting.recording_url || meeting.meeting_url || meeting.url || null,
    callDate,
  };
}
