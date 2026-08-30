// app/api/opportunities/sync/route.ts
//
// Pulls brand deals out of the Discord channels they're posted in and turns
// them into rows a client can actually find later.
//
// The posts are freeform — "HIRING for Makon AI", pay quoted as a view-tier
// table, a CPM, or a retainer, requirements buried mid-paragraph — so this
// reads them with Claude rather than pattern-matching. Everything that
// isn't a deal (chatter, questions, replies) is dropped by the same pass,
// which is why the model is asked to classify before it extracts.
//
// Re-running is safe and expected: discord_message_id is unique, so a
// second sync updates a deal rather than duplicating it.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchChannelMessages, discordMessageUrl, type DiscordMessage } from "@/lib/discord";
import { isAnthropicConfigured, ANTHROPIC_NOT_CONFIGURED_MESSAGE } from "@/lib/anthropicStatus";
import { NICHES } from "@/lib/theme";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 60;

// Read in one batch per channel. Deals arrive a few a week, so 30 covers a
// comfortable backlog without making the extraction call enormous.
const MESSAGES_PER_CHANNEL = 30;

// A deal post is substantial. Anything shorter is a reply, a reaction or a
// "is this still open?" — filtered before it reaches the model so the
// extraction isn't paying to classify chatter.
const MIN_DEAL_LENGTH = 120;

// How many new posts one run will extract. The first sync against a channel
// with history hit both limits at once — 22 posts ran 67s and truncated at
// 4000 output tokens, losing the whole batch. Newest first, and since
// already-imported messages are skipped, running again works through the
// rest. In steady state there are only one or two new posts anyway.
const MAX_PER_RUN = 8;

const DEAL_SCHEMA = {
  type: "object",
  properties: {
    deals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "The id of the message this came from, copied exactly." },
          isDeal: { type: "boolean", description: "False for chatter, questions, or anything that isn't an open brand offer." },
          brand: { type: "string" },
          title: { type: "string", description: "Short headline, under 70 chars." },
          description: { type: "string", description: "What the brand is and what the content is. 1-2 sentences." },
          niche: { type: "string", description: "One of the provided niches, or empty if none fit." },
          paySummary: { type: "string", description: "The pay terms as a client would read them, kept faithful to the post." },
          basePayUsd: { type: "number", description: "Base USD per video. 0 if not quoted per-video." },
          postingVolume: { type: "string", description: "Required or allowed posting cadence, verbatim if stated." },
          maxPostsPerMonth: { type: "number", description: "Realistic monthly ceiling implied by the cadence. 0 if not stated." },
          maxMonthlyUsd: { type: "number", description: "What a creator could earn in a month at that ceiling. 0 if not derivable." },
          deliverables: { type: "string" },
          requirements: { type: "string" },
          applyUrl: { type: "string", description: "Link to apply, or the brand's site. Empty if none in the post." },
          website: { type: "string", description: "Brand's domain only, e.g. makon.ai. Empty if not determinable from the post." },
          contactHandle: { type: "string", description: "Discord username the post tells creators to DM, if it names one that isn't the poster. Empty otherwise." },
        },
        required: ["messageId", "isDeal", "brand", "title", "paySummary"],
      },
    },
  },
  required: ["deals"],
} as const;

// Favicon service rather than a logo API: it needs no key, no account and
// no per-lookup cost, which matters more here than image quality. Null when
// there's no domain to ask about — the UI draws a monogram instead of
// showing a broken image.
function logoFor(website: string | undefined, applyUrl: string | undefined): string | null {
  let host = (website || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host && applyUrl) {
    try {
      host = new URL(applyUrl).hostname;
    } catch {
      /* not a usable URL */
    }
  }
  // Reject anything that isn't a plausible domain, and skip the link
  // shorteners and doc hosts these posts are full of — a Notion favicon
  // isn't the brand's logo.
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
  if (/(notion|docs\.google|discord|linktr|bit\.ly|typeform|airtable|forms\.gle)/i.test(host)) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function nonEmpty(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

function positive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: ANTHROPIC_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();

  const { data: org } = await admin
    .from("organizations")
    .select("brand_deal_channel_ids")
    .eq("id", profile.organization_id)
    .maybeSingle();
  const channelIds: string[] = org?.brand_deal_channel_ids || [];
  if (channelIds.length === 0) {
    return NextResponse.json(
      { error: "No brand-deal channels are configured for this org (organizations.brand_deal_channel_ids is empty)." },
      { status: 400 }
    );
  }

  const guildId = process.env.DISCORD_GUILD_ID || "";

  let messages: DiscordMessage[] = [];
  try {
    const batches = await Promise.all(channelIds.map((id) => fetchChannelMessages(id, MESSAGES_PER_CHANNEL)));
    messages = batches.flat();
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Couldn't read those Discord channels" }, { status: 502 });
  }

  const candidates = messages.filter((m) => (m.content + m.embedText).trim().length >= MIN_DEAL_LENGTH);
  if (candidates.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, scanned: messages.length });
  }

  // Skip anything already stored. The channels are append-only in practice,
  // so on a routine sync this leaves only the handful of genuinely new
  // posts to pay for.
  const { data: seen } = await admin
    .from("brand_opportunities")
    .select("discord_message_id")
    .in("discord_message_id", candidates.map((m) => m.id));
  const seenIds = new Set((seen || []).map((r: any) => r.discord_message_id));
  const unseen = candidates.filter((m) => !seenIds.has(m.id));

  if (unseen.length === 0) {
    return NextResponse.json({ imported: 0, remaining: 0, scanned: messages.length, alreadyHad: candidates.length });
  }

  const fresh = unseen.slice(0, MAX_PER_RUN);
  const remaining = unseen.length - fresh.length;

  const block = fresh
    .map((m) => `<message id="${m.id}" author="${m.authorName}">\n${m.content}\n${m.embedText}\n</message>`)
    .join("\n\n");

  const prompt = `These are recent messages from Discord channels where brand deals for UGC creators get posted. Turn the real offers into structured records.

${block}

Return one entry per message, keeping messageId exactly as given.

Set isDeal false — and don't bother filling anything else in — for anything that isn't a live brand offer a creator could take: questions, replies, banter, someone sharing a screenshot, a deal announced as closed or already filled.

For the real ones:
- paySummary: keep the actual terms. These posts quote pay in different shapes — a flat base per video, a view-tier table ("1.2K = $30, 50K = $130, 1M = $730"), a CPM ("$10/1k views"), a retainer ("30-post retainer from $25 base"), sometimes plus prizes. Summarise faithfully in a line or two; don't flatten a tier table into a single number.
- basePayUsd: the guaranteed per-video amount. For a range take the low end. 0 for CPM-only or retainer-only deals where no per-video base is quoted.
- postingVolume: the cadence, close to how it's written ("1-2x/day minimum", "unlimited posting").
- maxPostsPerMonth: what that cadence works out to in a month. "1-2x/day minimum" is about 60. Unlimited posting has no ceiling from the brand — estimate what one creator could realistically sustain, around 90. 0 if no cadence is given.
- maxMonthlyUsd: base pay times that ceiling, or the CPM equivalent at a realistic view count. This answers "what's this worth if I go all in", so be concrete but don't count the best-case view bonuses or one-off prizes — those aren't repeatable. 0 if you genuinely can't derive it.
- requirements: who qualifies — audience tier, niche, follower count, demographic asks. Verbatim where it's specific.
- website: the brand's own domain if the post makes it determinable. Not a Notion, Discord, Google Docs or form link — leave empty rather than guessing.
- contactHandle: only if the post explicitly tells creators to DM someone other than whoever posted it. Leave empty otherwise — the poster is assumed.

Available niches (use one exactly, or leave empty): ${NICHES.join(", ")}

Keep every field tight — description under 30 words, deliverables and requirements under 35 each, paySummary under 45. These are scan-and-decide cards, not the full post; the original is one click away.

Record everything by calling extract_deals.`;

  const message = await anthropic.messages
    .stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      tools: [{ name: "extract_deals", description: "Record the brand deals found.", input_schema: DEAL_SCHEMA as any }],
      tool_choice: { type: "tool", name: "extract_deals" },
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse) return NextResponse.json({ error: "Couldn't read those posts — try again." }, { status: 502 });

  const extracted: any[] = (toolUse as any).input?.deals || [];
  const byId = new Map(fresh.map((m) => [m.id, m]));

  const rows = extracted
    .filter((d) => d?.isDeal && d?.brand && byId.has(d.messageId))
    .map((d) => {
      const source = byId.get(d.messageId)!;
      return {
        organization_id: profile.organization_id,
        brand: String(d.brand).slice(0, 120),
        title: String(d.title || d.brand).slice(0, 200),
        description: nonEmpty(d.description),
        niche: NICHES.includes(d.niche) ? d.niche : null,
        pay_summary: nonEmpty(d.paySummary),
        base_pay_usd: positive(d.basePayUsd),
        posting_volume: nonEmpty(d.postingVolume),
        max_posts_per_month: positive(d.maxPostsPerMonth),
        max_monthly_usd: positive(d.maxMonthlyUsd),
        deliverables: nonEmpty(d.deliverables),
        requirements: nonEmpty(d.requirements),
        apply_url: nonEmpty(d.applyUrl),
        // The post's own image wins over a favicon — an attached brand
        // creative is a better thumbnail than a 128px icon.
        logo_url: source.imageUrl || logoFor(d.website, d.applyUrl),
        // Who a creator actually messages to get this. Defaults to the
        // poster, since these deals belong to campaign managers rather
        // than to us — we are not the ones handing them out.
        contact_discord_id: source.authorId || null,
        contact_discord_username: nonEmpty(d.contactHandle) || source.authorName,
        posted_by_profile_id: profile.id,
        source_channel_id: source.channelId,
        discord_message_id: source.id,
        discord_message_url: guildId ? discordMessageUrl(guildId, source.channelId, source.id) : null,
        posted_at: source.createdAt,
      };
    });

  if (rows.length === 0) {
    return NextResponse.json({ imported: 0, remaining, scanned: messages.length, noDealsFound: true });
  }

  const { data: inserted, error } = await admin
    .from("brand_opportunities")
    .upsert(rows, { onConflict: "discord_message_id" })
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const merged = await collapseRepeatedBrands(admin, profile.organization_id);

  return NextResponse.json({ imported: inserted?.length || 0, merged, remaining, scanned: messages.length, considered: fresh.length });
}

// A brand posts the same campaign more than once — a second hiring round, a
// bumped repost, the same offer in both channels — and each one is a
// separate Discord message, so each arrives as its own row. On the board
// that reads as three Tapvid deals when there is one.
//
// Collapses to the newest post per brand. Soft-deleted rather than removed,
// so the older terms are still recoverable and the message ids stay taken,
// which is what stops the next sync re-extracting them.
async function collapseRepeatedBrands(admin: ReturnType<typeof createAdminSupabaseClient>, organizationId: string): Promise<number> {
  const { data } = await admin
    .from("brand_opportunities")
    .select("id, brand, posted_at, created_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const newestByBrand = new Map<string, { id: string; when: string }>();
  const supersededIds: string[] = [];

  for (const row of data || []) {
    const key = (row.brand || "").trim().toLowerCase();
    if (!key) continue;
    const when = row.posted_at || row.created_at || "";
    const held = newestByBrand.get(key);
    if (!held) {
      newestByBrand.set(key, { id: row.id, when });
    } else if (when > held.when) {
      supersededIds.push(held.id);
      newestByBrand.set(key, { id: row.id, when });
    } else {
      supersededIds.push(row.id);
    }
  }

  if (supersededIds.length === 0) return 0;
  await admin
    .from("brand_opportunities")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", supersededIds);
  return supersededIds.length;
}
