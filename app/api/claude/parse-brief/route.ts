// app/api/claude/parse-brief/route.ts
//
// Turns a pasted brand brief (any format — email text, contract excerpt,
// bullet list) into the structured fields the KPI page's "Add a campaign"
// form needs: brand, rate/video, min/max posts per day, and the bonus tier
// ladder. A human still reviews and hits Save on the KPI page — this only
// pre-fills, it never writes a campaign directly, since a misread number in
// a client's actual pay rate is a real-money mistake, not a cosmetic one.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess, checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";
import { sanitizeParsedBrief } from "@/lib/parseBriefValidation";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { clientId, briefText } = await req.json();
  if (!briefText?.trim()) {
    return NextResponse.json({ error: "No brief text provided" }, { status: 400 });
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const usage = await checkAiUsageCap(supabase, clientId);
  if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status });

  const prompt = `You're extracting a UGC creator's retainer deal terms from a brand brief so they can be entered into a KPI tracker. The brief might be an email, a contract excerpt, a Slack/Discord message, or rough notes — extract what's actually stated, don't invent numbers that aren't there.

Brief:
"""
${briefText}
"""

Extract:
- brand: the brand/company name
- rate: dollar rate paid per video/post (a flat number, e.g. 35 for "$35/video")
- minPosts: minimum videos/posts required per day (0 if not specified)
- maxPosts: maximum videos/posts required or allowed per day (0 if not specified)
- bonusTiers: any view-count bonus structure mentioned (e.g. "10k views = +$50, 50k views = +$150") as a list of {views, bonus} pairs. Empty array if none mentioned.

Respond with ONLY valid JSON, no markdown fences, no preamble. Exact shape:
{"brand":"...","rate":0,"minPosts":0,"maxPosts":0,"bonusTiers":[{"views":0,"bonus":0}]}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();

  let parsed;
  try {
    parsed = sanitizeParsedBrief(JSON.parse(raw.replace(/```json|```/g, "").trim()));
  } catch {
    return NextResponse.json({ error: "Couldn't read a deal structure out of that brief — try pasting more of it, or fill in the fields manually" }, { status: 502 });
  }

  await logAiUsage(supabase, clientId, "parse-brief");
  return NextResponse.json({ parsed });
}
