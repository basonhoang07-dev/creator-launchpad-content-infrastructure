// lib/queries/opportunities.ts
//
// Brand deals, read straight through RLS — every member of the org sees the
// same board.
//
// Deals arrive via /api/opportunities/sync, which reads the Discord channels
// they're posted in; nothing here writes one. What a client does with a deal
// happens in Discord too: the card names the person to DM, because these
// offers belong to the campaign managers who posted them, not to us.

import type { SupabaseClient } from "@supabase/supabase-js";

export type OpportunityStatus = "open" | "closed" | "filled";

export interface BrandOpportunity {
  id: string;
  brand: string;
  title: string;
  description: string | null;
  niche: string | null;
  // Pay is kept as written plus two derived numbers — see migration 017 for
  // why it isn't normalised into a single rate.
  paySummary: string | null;
  basePayUsd: number | null;
  postingVolume: string | null;
  maxPostsPerMonth: number | null;
  maxMonthlyUsd: number | null;
  deliverables: string | null;
  requirements: string | null;
  applyUrl: string | null;
  logoUrl: string | null;
  contactDiscordId: string | null;
  contactDiscordUsername: string | null;
  deadline: string | null;
  status: OpportunityStatus;
  discordMessageUrl: string | null;
  postedAt: string | null;
  createdAt: string;
}

function mapOpportunity(r: any): BrandOpportunity {
  return {
    id: r.id,
    brand: r.brand,
    title: r.title,
    description: r.description,
    niche: r.niche,
    paySummary: r.pay_summary,
    basePayUsd: num(r.base_pay_usd),
    postingVolume: r.posting_volume,
    maxPostsPerMonth: num(r.max_posts_per_month),
    maxMonthlyUsd: num(r.max_monthly_usd),
    deliverables: r.deliverables,
    requirements: r.requirements,
    applyUrl: r.apply_url,
    logoUrl: r.logo_url,
    contactDiscordId: r.contact_discord_id,
    contactDiscordUsername: r.contact_discord_username,
    deadline: r.deadline,
    status: r.status,
    discordMessageUrl: r.discord_message_url,
    postedAt: r.posted_at,
    createdAt: r.created_at,
  };
}

// Postgres numerics arrive as strings over REST, so every money field has
// to go through this rather than being trusted as a number.
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchOpportunities(supabase: SupabaseClient): Promise<BrandOpportunity[]> {
  const { data } = await supabase
    .from("brand_opportunities")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data || []).map(mapOpportunity);
}

export async function setOpportunityStatus(supabase: SupabaseClient, id: string, status: OpportunityStatus) {
  const { error } = await supabase.from("brand_opportunities").update({ status }).eq("id", id);
  if (error) throw error;
}

// Soft-deleted, so a deal removed from the board keeps its Discord message
// id — which is what stops the next sync importing it all over again.
export async function removeOpportunity(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("brand_opportunities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export interface NewOpportunityInput {
  brand: string;
  title: string;
  description: string;
  niche: string;
  paySummary: string;
  basePayUsd: string;
  postingVolume: string;
  maxPostsPerMonth: string;
  requirements: string;
  applyUrl: string;
  contactDiscordUsername: string;
  contactDiscordId: string;
}

function optional(v: string): string | null {
  const t = (v || "").trim();
  return t.length > 0 ? t : null;
}

function numeric(v: string): number | null {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Deals added by hand: a brand that reached Akira directly rather than
// through the channels, or one the sync misread badly enough to be worth
// redoing. Left with a null discord_message_id, which is also what keeps
// them out of the sync's collapse-by-brand pass.
export async function createOpportunity(
  supabase: SupabaseClient,
  organizationId: string,
  profileId: string,
  input: NewOpportunityInput
): Promise<BrandOpportunity> {
  const base = numeric(input.basePayUsd);
  const posts = numeric(input.maxPostsPerMonth);

  const { data, error } = await supabase
    .from("brand_opportunities")
    .insert({
      organization_id: organizationId,
      brand: input.brand.trim(),
      title: optional(input.title) || input.brand.trim(),
      description: optional(input.description),
      niche: optional(input.niche),
      pay_summary: optional(input.paySummary),
      base_pay_usd: base,
      posting_volume: optional(input.postingVolume),
      max_posts_per_month: posts,
      // Derived the same way the sync derives it, so a hand-added deal sorts
      // alongside imported ones instead of falling to the bottom for want of
      // a number.
      max_monthly_usd: base && posts ? base * posts : null,
      requirements: optional(input.requirements),
      apply_url: optional(input.applyUrl),
      contact_discord_username: optional(input.contactDiscordUsername)?.replace(/^@/, "") ?? null,
      contact_discord_id: optional(input.contactDiscordId),
      posted_by_profile_id: profileId,
      posted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapOpportunity(data);
}
