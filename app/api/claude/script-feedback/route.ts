// app/api/claude/script-feedback/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess, checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { RETENTION_EDITING_FRAMEWORK, VIRAL_HOOK_FRAMEWORK } from "@/lib/frameworks";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { clientId, entryId } = await req.json();

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase, organizationId } = access;

  const usage = await checkAiUsageCap(supabase, clientId);
  if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status });

  const { data: entry, error: entryError } = await supabase.from("calendar_entries").select("*").eq("id", entryId).eq("client_id", clientId).single();
  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 });
  if (!entry?.script?.trim()) {
    return NextResponse.json({ error: "No script to review" }, { status: 400 });
  }

  const { data: formatSops } = await supabase
    .from("sops")
    .select("title, body")
    .eq("organization_id", organizationId)
    .eq("kind", "format")
    .is("deleted_at", null);

  const matchingSop = (formatSops || []).find((s) => (s.title || "").toLowerCase().includes((entry.format || "").toLowerCase())) || null;
  const sopContext = matchingSop
    ? `\nThis client has a documented format SOP for this style: "${matchingSop.title}" — ${matchingSop.body}\nWeigh the script against this SOP specifically.`
    : "";

  const prompt = `${RETENTION_EDITING_FRAMEWORK}

${VIRAL_HOOK_FRAMEWORK}

---

Using both lenses above, review this short-form UGC video script for the brand "${entry.brand}".
Concept: "${entry.title}"
Format: ${entry.format || "Talking head"}${sopContext}

Script:
"""
${entry.script}
"""

Give specific, actionable feedback tailored to this exact format — a skit needs scene/character clarity and comedic timing, storytelling needs a real arc and payoff, talking head lives or dies on the first 2 seconds and personality, a demo needs the value prop crystal clear, an unboxing needs anticipation before the reveal, GRWM needs the routine and the pitch to feel woven together, not bolted on.

Structure your response as:
Strengths: (1-2 short bullet points on what's working)
Improve: (2-4 short, specific, actionable bullet points — pull from either lens, whichever is most relevant)

Keep it tight — this is quick feedback, not a rewrite. Plain text only, no markdown formatting, use "-" for bullets.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const feedback = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();
  await logAiUsage(supabase, clientId, "script-feedback");
  return NextResponse.json({ feedback });
}
