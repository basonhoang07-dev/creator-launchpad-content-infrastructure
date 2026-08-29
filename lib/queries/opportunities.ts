// lib/queries/opportunities.ts
//
// Brand deals and who has put their hand up for them.
//
// Reads go straight through RLS: org members see every open deal, but
// claims are scoped by private.has_client_access, so the same query returns
// the whole board to an Admin and only their own row to a client. That's
// deliberate — who else applied isn't one client's business.
//
// Posting a deal goes through /api/opportunities instead, because it also
// announces to Discord with the bot token.

import type { SupabaseClient } from "@supabase/supabase-js";

export type OpportunityStatus = "open" | "closed" | "filled";
export type ClaimStatus = "interested" | "applied" | "accepted" | "declined";

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
  deadline: string | null;
  status: OpportunityStatus;
  discordMessageUrl: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface OpportunityClaim {
  id: string;
  opportunityId: string;
  clientId: string;
  clientName: string;
  status: ClaimStatus;
  note: string | null;
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

// Every claim the caller is allowed to see. A client gets their own rows
// back and nothing else, so the same call powers both "am I in on this"
// and the Admin's full applicant list.
export async function fetchClaims(supabase: SupabaseClient): Promise<OpportunityClaim[]> {
  const { data } = await supabase
    .from("brand_opportunity_claims")
    .select("id, opportunity_id, client_id, status, note, created_at, clients!inner(name)")
    .order("created_at", { ascending: true });

  return (data || []).map((r: any) => ({
    id: r.id,
    opportunityId: r.opportunity_id,
    clientId: r.client_id,
    clientName: r.clients?.name || "Unknown client",
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function claimOpportunity(
  supabase: SupabaseClient,
  opportunityId: string,
  clientId: string,
  profileId: string,
  note: string | null
) {
  const { data, error } = await supabase
    .from("brand_opportunity_claims")
    .insert({ opportunity_id: opportunityId, client_id: clientId, profile_id: profileId, note })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function withdrawClaim(supabase: SupabaseClient, claimId: string) {
  const { error } = await supabase.from("brand_opportunity_claims").delete().eq("id", claimId);
  if (error) throw error;
}

export async function setClaimStatus(supabase: SupabaseClient, claimId: string, status: ClaimStatus) {
  const { error } = await supabase.from("brand_opportunity_claims").update({ status }).eq("id", claimId);
  if (error) throw error;
}

export async function setOpportunityStatus(supabase: SupabaseClient, id: string, status: OpportunityStatus) {
  const { error } = await supabase.from("brand_opportunities").update({ status }).eq("id", id);
  if (error) throw error;
}

// Soft-deleted so a deal that's been claimed keeps its history rather than
// cascading those rows away.
export async function removeOpportunity(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("brand_opportunities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
