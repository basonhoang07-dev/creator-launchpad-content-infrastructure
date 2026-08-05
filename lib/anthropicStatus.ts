// lib/anthropicStatus.ts
//
// Every app/api/claude/* route needs the same up-front check: is there
// actually a usable Anthropic key configured? Without this, a missing/
// placeholder key surfaces as a generic "Couldn't generate..." message
// indistinguishable from a transient API failure — someone hits Retry a few
// times, gets confused, and never learns the real cause is "nobody's added
// a real key yet." This makes that distinction explicit everywhere Claude
// gets called.

export function isAnthropicConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key.trim().length > 0 && !key.includes("placeholder");
}

export const ANTHROPIC_NOT_CONFIGURED_MESSAGE =
  "AI features aren't set up yet — add a real ANTHROPIC_API_KEY in .env.local to turn this on.";
