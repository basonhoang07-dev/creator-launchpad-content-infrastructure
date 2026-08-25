// app/api/claude/plan-calendar/route.ts
//
// Server-side counterpart to the prototype's `planCalendarWithClaude()`.
// The prompt-construction logic is IDENTICAL to what's already tested in the
// prototype — the only thing that moved is *where* it runs (here, with a real
// hidden API key) instead of a direct browser fetch to api.anthropic.com,
// which only worked because the prototype ran inside Claude.ai's artifact
// sandbox. A real hosted site can't do that.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess, checkAiUsageCap, logAiUsage } from "@/lib/auth";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";

// Claude planning across a whole board can run long; 60s is the Hobby-plan
// maximum.
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { clientId, brand } = await req.json();

  // Real server-side auth check — this is the enforcement the prototype
  // could never do (everything there was client-side only).
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { supabase } = access;

  const usage = await checkAiUsageCap(supabase, clientId);
  if (!usage.ok) return NextResponse.json({ error: usage.error }, { status: usage.status });

  // Pull exactly the data the prototype's client-side code used to build
  // this same prompt — now via real queries instead of a local `data` object.
  // Every read here feeds scheduling math (volume, which days are filmable,
  // which concepts already exist) — a silently-swallowed error would produce
  // a wrong-but-plausible-looking schedule instead of a visible failure, so
  // each one aborts the request rather than falling back to an empty/default
  // value.
  const { data: campaign, error: campaignError } = await supabase
    .from("retainer_campaigns")
    .select("*")
    .eq("client_id", clientId)
    .eq("brand", brand)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });

  const kpiVol = campaign?.max_posts > 0 ? campaign.max_posts : 1;
  const capVol = campaign?.session_capacity > 0 ? campaign.session_capacity : null;
  const dailyVol = capVol ? Math.min(kpiVol, capVol) : kpiVol;

  const { data: unscheduled, error: unscheduledError } = await supabase
    .from("calendar_entries")
    .select("id, title, format, script")
    .eq("client_id", clientId)
    .eq("brand", brand)
    .is("entry_date", null);
  if (unscheduledError) return NextResponse.json({ error: unscheduledError.message }, { status: 500 });

  const { data: availability, error: availabilityError } = await supabase
    .from("availability_blocks")
    .select("*")
    .eq("client_id", clientId);
  if (availabilityError) return NextResponse.json({ error: availabilityError.message }, { status: 500 });

  const { data: scheduledAll, error: scheduledAllError } = await supabase
    .from("calendar_entries")
    .select("brand, format, entry_date")
    .eq("client_id", clientId)
    .not("entry_date", "is", null)
    .order("entry_date", { ascending: true });
  if (scheduledAllError) return NextResponse.json({ error: scheduledAllError.message }, { status: 500 });

  const { data: postedForBrand } = await supabase
    .from("calendar_entries")
    .select("format, view_count, bonus_logged")
    .eq("client_id", clientId)
    .eq("brand", brand)
    .eq("posted", true)
    .gt("view_count", 0);

  const { data: formatSops } = await supabase
    .from("sops")
    .select("title")
    .eq("organization_id", access.organizationId)
    .eq("kind", "format")
    .is("deleted_at", null);

  // ---- Same filmable-day walk as the prototype (isDayFilmable ported as-is) ----
  const lastDate = scheduledAll?.length ? scheduledAll[scheduledAll.length - 1].entry_date : null;
  let cursor = lastDate ? new Date(lastDate) : new Date();
  if (lastDate) cursor.setDate(cursor.getDate() + 1);
  const filmableDays: string[] = [];
  let guard = 0;
  while (filmableDays.length < 8 && guard < 60) {
    const ds = cursor.toISOString().slice(0, 10);
    if (isDayFilmable(availability || [], ds)) filmableDays.push(ds);
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }

  const recentFormats = (scheduledAll || []).filter((c) => c.brand === brand).slice(-5).map((c) => c.format);
  const pastPerformance = (postedForBrand || []).map((c) => ({ format: c.format, views: c.view_count, hitBonus: !!c.bonus_logged }));
  const formatSopTitles = (formatSops || []).map((s) => s.title);

  // ---- Identical prompt text to the prototype ----
  const prompt = `You're planning a short-form UGC content calendar for the brand "${brand}" — act as a strategist, not a slot-filler.

Daily filming volume to schedule: ${dailyVol} video(s) per filmable day.${capVol && capVol < kpiVol ? ` Note: KPI math alone would want ${kpiVol}/day, but the client can only realistically film ${capVol}/session — ${dailyVol} is the honest number, don't try to exceed it.` : ""}
Upcoming filmable days, in order: ${filmableDays.join(", ")}.
Existing unscheduled concepts (id, title, format, hasScript — whether a script/idea already exists): ${JSON.stringify((unscheduled || []).map((c) => ({ id: c.id, title: c.title, format: c.format, hasScript: !!(c.script && c.script.trim()) })))}.
${pastPerformance.length ? `Past posted performance for this brand (format, views, hit a bonus tier): ${JSON.stringify(pastPerformance)}` : "No posted performance data yet for this brand — don't fabricate a preference, just note that in your rationale if relevant."}
Recently scheduled formats, most recent last (avoid repeating these back-to-back): ${JSON.stringify(recentFormats)}.
${formatSopTitles.length ? `Client's documented content formats — prefer these when inventing new concepts: ${formatSopTitles.join(", ")}` : ""}

Task — you choose which concept goes on which day, you do NOT have to fill top-to-bottom:
1. Prioritize concepts that already have a script/idea (hasScript: true) onto the soonest days — that keeps scripting pressure off tight filming days.
2. Vary format day to day — never repeat the same format on consecutive filmable days, and lean toward formats with strong past performance where that data exists.
3. Only invent new concepts if there genuinely aren't enough existing ones to fill every slot — keep them punchy, concrete, and scroll-stopping in the first 1-3 seconds, working even muted. Prefer the client's documented formats when inventing.

Respond with ONLY valid JSON, no markdown fences, no preamble. Exact shape:
{"rationale":"<1-2 sentences explaining the scheduling logic you actually used>","assignments":[{"conceptId":"<id or null if new>","title":"<title>","format":"<format>","date":"YYYY-MM-DD"}]}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("\n")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Claude returned malformed JSON" }, { status: 502 });
  }

  await logAiUsage(supabase, clientId, "plan-calendar");

  // Writing the assignments back to the DB happens here, in the same
  // transaction, rather than being handled client-side like the prototype —
  // this closes the loop server-side so a client can't tamper with the batch
  // before it's saved.
  const batchId = `claude-batch-${Date.now()}`;
  // Each returned assignment carries the real row id (existing or newly
  // inserted) so the client can open the entry straight from the schedule
  // preview without guessing which new row matches which invented concept.
  const assignmentsWithIds: (typeof parsed.assignments[number] & { id: string })[] = [];
  const writeFailures: string[] = [];
  for (const a of parsed.assignments || []) {
    if (a.conceptId) {
      const { error } = await supabase.from("calendar_entries").update({ entry_date: a.date, batch: batchId }).eq("id", a.conceptId).is("entry_date", null);
      if (error) writeFailures.push(`"${a.title}" (${a.conceptId}): ${error.message}`);
      else assignmentsWithIds.push({ ...a, id: a.conceptId });
    } else {
      const { data: inserted, error } = await supabase
        .from("calendar_entries")
        .insert({
          client_id: clientId, brand, title: a.title, format: a.format || "Talking head",
          script: "", entry_date: a.date, batch: batchId, status: "Unscripted",
          notes: "Suggested by Claude — write a fresh script for it.",
        })
        .select("id")
        .single();
      if (error || !inserted) writeFailures.push(`"${a.title}" (new): ${error?.message || "insert returned no row"}`);
      else assignmentsWithIds.push({ ...a, id: inserted.id });
    }
  }

  // Some assignments landing and others silently not is worse than an
  // all-or-nothing error — and the caller (calendar/page.tsx) only checks
  // res.ok, treating any 2xx as full success. A non-2xx status is what
  // actually reaches the user as an error instead of a schedule that's
  // quietly missing entries with no indication why. Whatever DID save is
  // still in the DB — reloading the calendar will show it — this is just an
  // honest signal that not everything Claude proposed made it in.
  if (writeFailures.length > 0) {
    return NextResponse.json({ error: `Some of the schedule didn't save — reload the calendar to see what did: ${writeFailures.join("; ")}` }, { status: 500 });
  }

  return NextResponse.json({ rationale: parsed.rationale, assignments: assignmentsWithIds });
}

// Ported as-is from the prototype's helper of the same name.
function isDayFilmable(blocks: any[], dateStr: string): boolean {
  const dayBlocks = blocks.filter((b) => blockOccursOn(b, dateStr));
  if (dayBlocks.some((b) => b.label === "Unavailable" && b.all_day)) return false;
  return dayBlocks.some((b) => b.label === "Filming");
}

function blockOccursOn(block: any, dateStr: string): boolean {
  if (block.repeat_freq === "none" || !block.repeat_freq) return block.block_date === dateStr;
  const blockDate = new Date(block.block_date);
  const target = new Date(dateStr);
  if (target < blockDate) return false;
  if (block.repeat_freq === "daily") return true;
  if (block.repeat_freq === "weekly") return blockDate.getDay() === target.getDay();
  if (block.repeat_freq === "weekday") return target.getDay() >= 1 && target.getDay() <= 5;
  return false;
}
