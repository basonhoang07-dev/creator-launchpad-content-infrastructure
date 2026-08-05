import { describe, it, expect } from "vitest";
import { verifyFathomSignature, signFathomPayload, extractInviteeEmails, extractTranscript, extractMeta } from "./fathomWebhook";

function headersOf(map: Record<string, string>): Pick<Headers, "get"> {
  return { get: (key: string) => map[key.toLowerCase()] ?? null };
}

const secret = "whsec_" + Buffer.from("test-secret-bytes").toString("base64");

describe("verifyFathomSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    const body = JSON.stringify({ hello: "world" });
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signFathomPayload(body, secret, id, timestamp);
    const headers = headersOf({ "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature });
    expect(verifyFathomSignature(body, headers, secret)).toBe(true);
  });

  it("rejects when the secret is unset", () => {
    const headers = headersOf({ "webhook-id": "x", "webhook-timestamp": "1", "webhook-signature": "v1,abc" });
    expect(verifyFathomSignature("{}", headers, undefined)).toBe(false);
  });

  it("rejects when any signing header is missing", () => {
    const headers = headersOf({ "webhook-id": "x", "webhook-timestamp": "1" });
    expect(verifyFathomSignature("{}", headers, secret)).toBe(false);
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const body = JSON.stringify({ hello: "world" });
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signFathomPayload(body, secret, id, timestamp);
    const headers = headersOf({ "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature });
    expect(verifyFathomSignature(JSON.stringify({ hello: "tampered" }), headers, secret)).toBe(false);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const body = "{}";
    const id = "msg_123";
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 min old
    const signature = signFathomPayload(body, secret, id, staleTimestamp);
    const headers = headersOf({ "webhook-id": id, "webhook-timestamp": staleTimestamp, "webhook-signature": signature });
    expect(verifyFathomSignature(body, headers, secret)).toBe(false);
  });

  it("rejects when signed with the wrong secret", () => {
    const body = "{}";
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const wrongSecret = "whsec_" + Buffer.from("someone-elses-secret").toString("base64");
    const signature = signFathomPayload(body, wrongSecret, id, timestamp);
    const headers = headersOf({ "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": signature });
    expect(verifyFathomSignature(body, headers, secret)).toBe(false);
  });

  it("accepts when the real signature is one of several space-separated candidates", () => {
    const body = "{}";
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const real = signFathomPayload(body, secret, id, timestamp);
    const headers = headersOf({ "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v0,bogus== ${real} v2,alsobogus==` });
    expect(verifyFathomSignature(body, headers, secret)).toBe(true);
  });
});

describe("extractInviteeEmails", () => {
  it("reads calendar_invitees objects with an email field", () => {
    const payload = { meeting: { calendar_invitees: [{ email: "a@x.com", name: "A" }, { email: "b@x.com" }] } };
    expect(extractInviteeEmails(payload)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("falls back to invitees / attendees, and accepts bare-string entries", () => {
    expect(extractInviteeEmails({ meeting: { invitees: ["a@x.com"] } })).toEqual(["a@x.com"]);
    expect(extractInviteeEmails({ meeting: { attendees: ["a@x.com"] } })).toEqual(["a@x.com"]);
  });

  it("unwraps a data.meeting envelope", () => {
    expect(extractInviteeEmails({ data: { meeting: { calendar_invitees: [{ email: "a@x.com" }] } } })).toEqual(["a@x.com"]);
  });

  it("returns an empty array instead of throwing on garbage input", () => {
    expect(extractInviteeEmails({})).toEqual([]);
    expect(extractInviteeEmails(null)).toEqual([]);
    expect(extractInviteeEmails({ meeting: { calendar_invitees: "not-an-array" } })).toEqual([]);
    expect(extractInviteeEmails({ meeting: { calendar_invitees: [{ noEmail: true }, 5, null] } })).toEqual([]);
  });
});

describe("extractTranscript", () => {
  it("returns a string transcript as-is", () => {
    expect(extractTranscript({ meeting: { transcript: "hello" } })).toBe("hello");
  });

  it("joins a structured turn array with speaker names", () => {
    const payload = { meeting: { transcript: [{ speaker: { name: "Akira" }, text: "hey" }, { speaker: "Andrew", text: "hi" }] } };
    expect(extractTranscript(payload)).toBe("Akira: hey\nAndrew: hi");
  });

  it("falls back to a string summary when there's no transcript", () => {
    expect(extractTranscript({ meeting: { summary: "short summary" } })).toBe("short summary");
  });

  it("falls back to summary.markdown_formatted", () => {
    expect(extractTranscript({ meeting: { summary: { markdown_formatted: "**bold**" } } })).toBe("**bold**");
  });

  it("returns empty string rather than throwing when nothing is present", () => {
    expect(extractTranscript({})).toBe("");
  });
});

describe("extractMeta", () => {
  it("prefers scheduled_start_time, truncated to a date", () => {
    const meta = extractMeta({ meeting: { scheduled_start_time: "2026-07-21T14:00:00Z", title: "1-on-1", share_url: "https://fathom.video/x" } });
    expect(meta).toEqual({ title: "1-on-1", recordingUrl: "https://fathom.video/x", callDate: "2026-07-21" });
  });

  it("defaults title/recordingUrl to null and callDate to today when absent", () => {
    const meta = extractMeta({});
    expect(meta.title).toBeNull();
    expect(meta.recordingUrl).toBeNull();
    expect(meta.callDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
