import { describe, it, expect } from "vitest";
import { matchesClientMeetEmail } from "@/lib/queries/recaps";

describe("matchesClientMeetEmail", () => {
  it("matches when both emails are identical", () => {
    expect(matchesClientMeetEmail("adam@example.com", "adam@example.com")).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    expect(matchesClientMeetEmail("Adam@Example.com", "adam@example.com")).toBe(true);
    expect(matchesClientMeetEmail("adam@example.com", "ADAM@EXAMPLE.COM")).toBe(true);
  });

  it("ignores leading/trailing whitespace on the attendee input", () => {
    expect(matchesClientMeetEmail("  adam@example.com  ", "adam@example.com")).toBe(true);
  });

  it("does not match a different email", () => {
    expect(matchesClientMeetEmail("someone-else@example.com", "adam@example.com")).toBe(false);
  });

  it("never matches when the attendee email is blank, even if the client's meet email is also blank", () => {
    expect(matchesClientMeetEmail("", "")).toBe(false);
    expect(matchesClientMeetEmail("   ", "")).toBe(false);
  });

  it("never matches when the client has no Meet email on file", () => {
    expect(matchesClientMeetEmail("adam@example.com", null)).toBe(false);
    expect(matchesClientMeetEmail("adam@example.com", undefined)).toBe(false);
  });

  it("does not do partial/substring matching — a superstring email must not match", () => {
    expect(matchesClientMeetEmail("adam@example.com.evil.com", "adam@example.com")).toBe(false);
  });
});
