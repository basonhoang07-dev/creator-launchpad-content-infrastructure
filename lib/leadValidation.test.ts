// The funnel's gate. This is the only unauthenticated write in the app, and
// every row it lets through becomes a phone call somebody has to make — so
// these tests care as much about not rejecting real people as they do about
// catching junk.

import { describe, it, expect } from "vitest";
import {
  validateEmailShape, validatePhone, validateName,
  quizLabel, boundedInt,
} from "./leadValidation";

describe("validatePhone", () => {
  it("accepts real numbers in E.164, which is what the funnel submits", () => {
    for (const n of ["+14155882300", "+919822041234", "+447700900123", "+4915112345678"]) {
      expect(validatePhone(n).ok, n).toBe(true);
    }
  });

  it("accepts a real number whose tail happens to look like counting", () => {
    // +61 412 345 678 is an ordinary Australian mobile. Stripping the dial
    // code to hunt for junk leaves "12345678", and an earlier version of this
    // rejected it on that basis — rejecting a real person is the worse of the
    // two failures here, so the sequence rule now needs nine digits.
    expect(validatePhone("+61412345678").ok).toBe(true);
  });

  it("accepts numbers with the separators people actually type", () => {
    expect(validatePhone("+1 (415) 555-8812").ok).toBe(true);
    expect(validatePhone("+44 7700 900 123").ok).toBe(true);
  });

  it("rejects a repeated digit even behind a dial code", () => {
    // The regression this suite exists for. Before the fix these arrived as
    // 91111111 and 11111111111, which are neither a repeated digit nor a
    // sequence once the country code is glued on the front.
    expect(validatePhone("+91111111").ok).toBe(false);
    expect(validatePhone("+1 111 111 1111").ok).toBe(false);
    expect(validatePhone("1111111").ok).toBe(false);
  });

  it("rejects counting up or down, behind a dial code or not", () => {
    expect(validatePhone("1234567890").ok).toBe(false);
    expect(validatePhone("+919876543210").ok).toBe(false);
    expect(validatePhone("+911234567890").ok).toBe(false);
  });

  it("rejects the numbers people invent, behind a dial code", () => {
    expect(validatePhone("+15551234").ok).toBe(false);
    expect(validatePhone("+10000000").ok).toBe(false);
  });

  it("rejects lengths no national scheme could use", () => {
    expect(validatePhone("12345").ok).toBe(false);
    expect(validatePhone("1234567890123456789").ok).toBe(false);
    expect(validatePhone("").ok).toBe(false);
  });

  it("explains itself in words the person typing can act on", () => {
    expect(validatePhone("12345").error).toMatch(/short/i);
    expect(validatePhone("").error).toMatch(/enter/i);
  });
});

describe("validateName", () => {
  it("accepts names with accents, hyphens and apostrophes", () => {
    for (const n of ["Alex Rivera", "Siobhán O'Connor", "Jean-Luc Picard", "Ana María"]) {
      expect(validateName(n).ok, n).toBe(true);
    }
  });

  it("collapses runs of whitespace", () => {
    expect(validateName("  Alex   Rivera  ").normalized).toBe("Alex Rivera");
  });

  it("rejects keyboard mash", () => {
    expect(validateName("asdfgh").ok).toBe(false);
    expect(validateName("aaaaaaa").ok).toBe(false);
  });

  it("rejects input with no letters in it at all", () => {
    expect(validateName("123456").ok).toBe(false);
    expect(validateName("-").ok).toBe(false);
  });
});

describe("validateEmailShape", () => {
  it("accepts ordinary addresses", () => {
    for (const e of ["alex@gmail.com", "alex.rivera+ugc@company.co.uk", "a1@x.io"]) {
      expect(validateEmailShape(e).ok, e).toBe(true);
    }
  });

  it("lowercases and trims", () => {
    expect(validateEmailShape("  Alex@Gmail.COM ").normalized).toBe("alex@gmail.com");
  });

  it("rejects disposable inboxes, because that address is where access goes", () => {
    expect(validateEmailShape("alex@mailinator.com").ok).toBe(false);
    expect(validateEmailShape("alex@yopmail.com").ok).toBe(false);
  });

  it("rejects malformed addresses", () => {
    for (const e of ["alex@@gmail.com", "alex@", "@gmail.com", "alex gmail.com", "alex@gmail..com", ""]) {
      expect(validateEmailShape(e).ok, e).toBe(false);
    }
  });
});

describe("quizLabel", () => {
  it("keeps the label the funnel displayed", () => {
    expect(quizLabel("$500-2k/mo")).toBe("$500-2k/mo");
    expect(quizLabel("United Kingdom")).toBe("United Kingdom");
  });

  it("trims and collapses whitespace", () => {
    expect(quizLabel("  Full   time  ")).toBe("Full time");
  });

  it("treats blank and non-strings as absent rather than empty", () => {
    // Null beats "" in the column: a caller reading the sheet can tell the
    // difference between "didn't answer" and "answered with nothing".
    expect(quizLabel("")).toBeNull();
    expect(quizLabel("   ")).toBeNull();
    expect(quizLabel(undefined)).toBeNull();
    expect(quizLabel(null)).toBeNull();
    expect(quizLabel(42)).toBeNull();
    expect(quizLabel({ a: 1 })).toBeNull();
  });

  it("caps length so a hand-rolled POST can't stuff the column", () => {
    expect(quizLabel("x".repeat(500), 60)).toHaveLength(60);
    expect(quizLabel("x".repeat(500))).toHaveLength(120);
  });
});

describe("boundedInt", () => {
  it("accepts the values the funnel actually sends", () => {
    expect(boundedInt(1, 1, 3)).toBe(1);
    expect(boundedInt(3, 1, 3)).toBe(3);
  });

  it("accepts numeric strings, since JSON bodies aren't always typed", () => {
    expect(boundedInt("2", 1, 3)).toBe(2);
  });

  it("rejects anything outside the range", () => {
    expect(boundedInt(0, 1, 3)).toBeNull();
    expect(boundedInt(4, 1, 3)).toBeNull();
    expect(boundedInt(-1, 1, 3)).toBeNull();
  });

  it("rejects non-integers and junk", () => {
    expect(boundedInt(2.5, 1, 3)).toBeNull();
    expect(boundedInt("abc", 1, 3)).toBeNull();
    expect(boundedInt(NaN, 1, 3)).toBeNull();
    expect(boundedInt(null, 1, 3)).toBeNull();
    expect(boundedInt(undefined, 1, 3)).toBeNull();
    expect(boundedInt([], 1, 3)).toBeNull();
  });

  it("rejects booleans, which Number() would otherwise turn into a valid tier", () => {
    expect(boundedInt(true, 1, 3)).toBeNull();
    expect(boundedInt(false, 1, 3)).toBeNull();
  });

  it("rejects empty and whitespace strings, which Number() reads as zero", () => {
    expect(boundedInt("", 1, 3)).toBeNull();
    expect(boundedInt("  ", 1, 3)).toBeNull();
  });
});
