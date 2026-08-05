// app/api/claude/adapt-script/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess, checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { RETENTION_EDITING_FRAMEWORK } from "@/lib/frameworks";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  // sourceScript is passed directly (pasted, or pulled client-side from an
  // existing entry the user already has legitimate read access to) — runNote
  // is the optional "what's being pushed in this specific video" field.
  const { clientId, brand, sourceScript, runNote } = await req.json();

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  const usage = await checkAiUsageCap(supabase, clientId);
  if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status });

  const { data: profile, error: profileError } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("brand", brand)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  if (!profile) {
    return NextResponse.json({ error: "No brand profile set up for this board yet" }, { status: 400 });
  }
  if (!sourceScript?.trim()) {
    return NextResponse.json({ error: "No source script provided" }, { status: 400 });
  }

  const prompt = `${RETENTION_EDITING_FRAMEWORK}

---

You're adapting a short-form video script to a specific brand's product, using their own reference demo scripts as a guide for how this brand demonstrates its product — not to copy verbatim, but to match their voice and demo style.

Brand: ${brand}
${(profile.product_note || "").trim() ? `General product context: ${profile.product_note}` : ""}
${runNote?.trim() ? `What's being pushed in this specific video: ${runNote}` : ""}

Brand's reference product demo scripts:
Demo #1: """${profile.demo_script_1}"""
Demo #2: """${profile.demo_script_2}"""
Demo #3: """${profile.demo_script_3}"""

Source script to adapt (this has a proven hook/structure worth keeping):
"""
${sourceScript}
"""

Task: adapt the source script to this brand's product. Keep the source script's proven hook, structure, and pacing intact — only touch what's needed. Either continue the script naturally into a product demo beat, or weave the product in wherever it fits best within the existing structure — whichever serves the script better, your call. Follow the retention editing framework above: precision over rewriting, cut before you add, protect what's already working.

Output ONLY the adapted script. Plain text, no headers, no explanation, no markdown.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const result = message.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n").trim();
  await logAiUsage(supabase, clientId, "adapt-script");
  return NextResponse.json({ result });
}
