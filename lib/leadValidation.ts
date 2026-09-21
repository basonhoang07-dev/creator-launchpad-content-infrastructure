// lib/leadValidation.ts
//
// Gatekeeping for the public funnel. This is the only place on the whole
// app that accepts input from strangers, and every row it lets through
// becomes a phone call someone has to make — so a junk lead costs real time,
// not just a wasted database row.
//
// Two kinds of bad input, and they need different tests:
//
//   - Fake on purpose. "asdf@asdf.com", "aaaaaaa@gmail.com", "1111111111".
//     Caught by shape: keyboard runs, no vowels, repeated characters,
//     sequential digits.
//   - Wrong by accident. "me@gmial.com", a real-looking domain that doesn't
//     exist. Shape can't catch these at all — only asking DNS whether the
//     domain can receive mail can, which is why that check is worth the
//     round trip.
//
// Deliberately not clever about it: the cost of rejecting a real person is
// much higher than the cost of letting one fake through, so every rule here
// errs toward accepting when unsure.

import { promises as dns } from "dns";

// The quiz answers, as the labels the funnel displayed rather than its
// internal codes. Trimmed and capped rather than checked against a list: the
// funnel owns its own wording, and rejecting an answer because a label got
// reworded would drop a real lead over a copy change.
export function quizLabel(input: unknown, max = 120): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : null;
}

// Market tier and entry phase are both 1-3. Anything else means the funnel
// has drifted from this route, and a null is more honest on a call sheet
// than a number nobody can explain.
//
// Booleans are rejected explicitly: Number(true) is 1, which would otherwise
// sail through as a valid tier.
export function boundedInt(input: unknown, min: number, max: number): number | null {
  if (typeof input !== "number" && typeof input !== "string") return null;
  if (typeof input === "string" && !input.trim()) return null;
  const n = Number(input);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export interface ValidationResult {
  ok: boolean;
  // Written to be shown to the person typing, not logged — it has to tell
  // them what to fix without implying they're being accused of anything.
  error?: string;
  normalized?: string;
}

// Throwaway inbox providers. Not exhaustive and never will be — this is the
// long tail's worth of the top offenders, and the MX check catches the rest
// of what matters.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "sharklasers.com",
  "getnada.com", "temp-mail.org", "fakeinbox.com", "maildrop.cc",
  "dispostable.com", "mintemail.com", "spamgourmet.com", "mailnesia.com",
]);

// A local part with no vowel and no digit is almost always mashed: "asdfgh",
// "qwrtp". Real names and words have vowels; real handles usually have
// digits or separators.
function looksMashed(local: string): boolean {
  const s = local.toLowerCase();
  if (s.length < 4) return false;

  // Same character four or more times running — "aaaa@", "....".
  if (/(.)\1{3,}/.test(s)) return true;

  // A run of a keyboard row, which is what people type when they're making
  // something up rather than reading it off.
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
  for (const row of rows) {
    for (let i = 0; i + 4 <= row.length; i++) {
      if (s.includes(row.slice(i, i + 4))) return true;
      if (s.includes(row.slice(i, i + 4).split("").reverse().join(""))) return true;
    }
  }

  // No vowel at all in a long-enough alphabetic local part. "y" counts —
  // plenty of real names lean on it.
  const letters = s.replace(/[^a-z]/g, "");
  if (letters.length >= 6 && !/[aeiouy]/.test(letters)) return true;

  return false;
}

export function validateEmailShape(input: string): ValidationResult {
  const email = (input || "").trim().toLowerCase();

  if (!email) return { ok: false, error: "Enter your email address." };
  if (email.length > 254) return { ok: false, error: "That email is too long." };

  // Deliberately stricter than the RFC: no quoted local parts, no IP-literal
  // domains, no consecutive dots. Nobody typing their email into a funnel
  // has any of those, and allowing them only widens what has to be handled
  // downstream.
  if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) {
    return { ok: false, error: "That doesn't look like a valid email address." };
  }
  if (email.includes("..")) return { ok: false, error: "That doesn't look like a valid email address." };

  const [local, domain] = email.split("@");

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: "Please use a real email address — we'll send your access there." };
  }
  if (looksMashed(local)) {
    return { ok: false, error: "That email doesn't look right. Double-check it?" };
  }

  // A two-character TLD is a country code and fine; a one-character one
  // doesn't exist.
  const tld = domain.split(".").pop() || "";
  if (tld.length < 2) return { ok: false, error: "That doesn't look like a valid email address." };

  return { ok: true, normalized: email };
}

// Does this domain actually accept mail? The one check that catches a typo'd
// real-looking domain, which shape tests never can.
//
// A lookup failure is treated as a pass, not a rejection: DNS being slow or
// blocked is our problem, and turning it into "your email is invalid" would
// reject real people for our outage.
export async function domainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) return true;
    // Some small domains run mail on the A record with no MX. Rare, but
    // rejecting them would be wrong.
    const a = await dns.resolve4(domain).catch(() => []);
    return a.length > 0;
  } catch (err: any) {
    // NXDOMAIN is the domain genuinely not existing — that one is a real
    // rejection. Anything else is our lookup failing.
    if (err?.code === "ENOTFOUND" || err?.code === "NXDOMAIN") return false;
    return true;
  }
}

// Phone. Deliberately loose on format and strict on substance: people write
// numbers a dozen ways and any of them is fine, but the digits underneath
// have to be capable of being a real number.
// The shapes people produce when they don't want to give a real number.
// Applied to a bare run of digits with no country code in front of it.
//
// checkSequences is off for short candidates because this runs against the
// number with one, two and three leading digits chopped off, and a short
// enough tail of a real number can look like counting: +61 412 345 678 is an
// ordinary Australian mobile whose last eight digits are "12345678". Nine is
// where a run stops being a coincidence.
function looksInvented(digits: string, checkSequences: boolean): boolean {
  // All one digit: 1111111, 0000000.
  if (/^(\d)\1+$/.test(digits)) return true;

  // The numbers everyone reaches for when inventing one. These are specific
  // enough to be safe on a shortened candidate — 555-1234 is the reserved
  // fictional range, and no real tail counts 1231231.
  if (/^(5{7,}|5551234|1231231|0000000)/.test(digits)) return true;

  // 1234567890 and its reverse, in any length. Nobody's number counts up.
  // "1234567" lives here rather than with the fixed shapes above because it
  // is just counting, and counting is exactly what a chopped-down real
  // number can accidentally look like.
  if (checkSequences) {
    const ascending = "01234567890123456789";
    const descending = "98765432109876543210";
    if (ascending.includes(digits) || descending.includes(digits)) return true;
    if (/^1234567/.test(digits)) return true;
  }

  return false;
}

export function validatePhone(input: string): ValidationResult {
  const raw = (input || "").trim();
  if (!raw) return { ok: false, error: "Enter your phone number." };

  const digits = raw.replace(/\D/g, "");

  // E.164 allows 15; below 7 there is no national scheme it could belong to.
  if (digits.length < 7) return { ok: false, error: "That number looks too short." };
  if (digits.length > 15) return { ok: false, error: "That number looks too long." };

  // Every junk rule below has to be tried against the national part as well
  // as the whole string. The funnel submits E.164 now, so "+91 111111"
  // arrives as 91111111 — not a repeated digit, not a sequence, and not
  // matching an anchored prefix, so all three checks would wave it through.
  // Stripping one, two and three leading digits covers every dial code
  // without keeping a table of them.
  // The whole string keeps the original rules. The three shortened forms are
  // the country code being stripped without needing a table of dial codes,
  // and they only get the sequence rule once they are long enough for a run
  // to mean something.
  const junk =
    looksInvented(digits, true) ||
    [digits.slice(1), digits.slice(2), digits.slice(3)]
      .filter((d) => d.length >= 6)
      .some((d) => looksInvented(d, d.length >= 9));
  if (junk) {
    return { ok: false, error: "Enter your real phone number." };
  }

  // Kept in the shape they typed it, with a + preserved when present —
  // whoever dials this needs the country code, and reformatting a number we
  // can't be certain about risks mangling it.
  const normalized = raw.startsWith("+") ? `+${digits}` : digits;
  return { ok: true, normalized };
}

export function validateName(input: string): ValidationResult {
  const name = (input || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Enter your first name." };
  if (name.length > 80) return { ok: false, error: "That name is too long." };
  if (!/[a-zA-ZÀ-ɏЀ-ӿ]/.test(name)) return { ok: false, error: "Enter your first name." };
  if (looksMashed(name.replace(/\s/g, ""))) return { ok: false, error: "That name doesn't look right." };
  return { ok: true, normalized: name };
}
