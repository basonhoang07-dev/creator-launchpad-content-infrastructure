// lib/parseBriefValidation.ts
//
// Sanitizes whatever Claude returns for app/api/claude/parse-brief before it
// ever reaches a campaign form or the database. Claude's JSON is generally
// well-formed, but "generally" isn't good enough for numbers that feed a
// client's actual pay rate — a hallucinated negative rate or a bonus tier
// with 0 views (which bonusForEntry, lib/queries/calendar.ts, already
// treats as "unreachable" for a different reason) should never silently
// become a real campaign value. Pulled out as a pure function so this can
// be tested without a live Anthropic call.

export interface ParsedBonusTier {
  views: number;
  bonus: number;
}

export interface ParsedBrief {
  brand: string;
  rate: number;
  minPosts: number;
  maxPosts: number;
  bonusTiers: ParsedBonusTier[];
}

function positiveNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function sanitizeParsedBrief(raw: any): ParsedBrief {
  const brand = typeof raw?.brand === "string" ? raw.brand.trim().slice(0, 200) : "";
  const rate = positiveNumber(raw?.rate);
  const minPosts = positiveNumber(raw?.minPosts);
  let maxPosts = positiveNumber(raw?.maxPosts);
  // A max below the min is contradictory — widen it rather than silently
  // producing a campaign that can never hit its own floor.
  if (maxPosts > 0 && maxPosts < minPosts) maxPosts = minPosts;

  const rawTiers = Array.isArray(raw?.bonusTiers) ? raw.bonusTiers : [];
  const bonusTiers = rawTiers
    .map((t: any) => ({ views: positiveNumber(t?.views), bonus: positiveNumber(t?.bonus) }))
    .filter((t: ParsedBonusTier) => t.views > 0 && t.bonus > 0)
    .sort((a: ParsedBonusTier, b: ParsedBonusTier) => a.views - b.views);

  return { brand, rate, minPosts, maxPosts, bonusTiers };
}
