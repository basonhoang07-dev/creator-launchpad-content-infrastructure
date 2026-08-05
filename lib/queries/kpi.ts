// lib/queries/kpi.ts
//
// Fetch + mutation helpers for the KPI Trackers page. Field names are mapped
// snake_case (DB) <-> camelCase (component state) at this boundary only.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BonusTier {
  id: string;
  views: number;
  bonus: number;
}

export interface Campaign {
  id: string;
  brand: string;
  rate: number;
  minPosts: number;
  maxPosts: number;
  sessionCapacity: number;
  bonusTiers: BonusTier[];
}

export interface UgcKpi {
  goal: number;
  ratePerDeal: number;
  closingRate: number;
  responseRate: number;
}

export interface KPIPageData {
  campaigns: Campaign[];
  kpi: UgcKpi;
}

function mapCampaignRow(row: any): Campaign {
  return {
    id: row.id,
    brand: row.brand,
    rate: row.rate || 0,
    minPosts: row.min_posts || 0,
    maxPosts: row.max_posts || 0,
    sessionCapacity: row.session_capacity || 0,
    bonusTiers: (row.bonus_tiers || []).map((t: any) => ({ id: t.id, views: t.views, bonus: t.bonus })),
  };
}

export async function fetchKPIData(supabase: SupabaseClient, clientId: string): Promise<KPIPageData> {
  const [{ data: campaignRows }, { data: clientRow }] = await Promise.all([
    supabase.from("retainer_campaigns").select("*, bonus_tiers(*)").eq("client_id", clientId),
    supabase
      .from("clients")
      .select("ugc_kpi_goal, ugc_kpi_rate_per_deal, ugc_kpi_closing_rate, ugc_kpi_response_rate")
      .eq("id", clientId)
      .single(),
  ]);

  return {
    campaigns: (campaignRows || []).map(mapCampaignRow),
    kpi: {
      goal: clientRow?.ugc_kpi_goal || 0,
      ratePerDeal: clientRow?.ugc_kpi_rate_per_deal || 0,
      closingRate: clientRow?.ugc_kpi_closing_rate || 0,
      responseRate: clientRow?.ugc_kpi_response_rate || 0,
    },
  };
}

export async function addCampaign(supabase: SupabaseClient, clientId: string, brand: string, rate: number, minPosts: number, maxPosts: number) {
  const { data, error } = await supabase
    .from("retainer_campaigns")
    .insert({ client_id: clientId, brand, rate, min_posts: minPosts, max_posts: maxPosts, session_capacity: 0 })
    .select()
    .single();
  if (error) throw error;
  return mapCampaignRow({ ...data, bonus_tiers: [] });
}

export async function updateCampaignField(supabase: SupabaseClient, campaignId: string, field: "rate" | "minPosts" | "maxPosts" | "sessionCapacity", value: number) {
  const column = { rate: "rate", minPosts: "min_posts", maxPosts: "max_posts", sessionCapacity: "session_capacity" }[field];
  const { error } = await supabase.from("retainer_campaigns").update({ [column]: value }).eq("id", campaignId);
  if (error) throw error;
}

export async function removeCampaign(supabase: SupabaseClient, campaignId: string) {
  const { error } = await supabase.from("retainer_campaigns").delete().eq("id", campaignId);
  if (error) throw error;
}

export async function addBonusTier(supabase: SupabaseClient, campaignId: string) {
  const { data, error } = await supabase.from("bonus_tiers").insert({ campaign_id: campaignId, views: 10000, bonus: 50 }).select().single();
  if (error) throw error;
  return { id: data.id, views: data.views, bonus: data.bonus } as BonusTier;
}

// Used by the "parse a brief with Claude" flow (app/api/claude/parse-brief)
// to insert tiers at their real extracted values in one write, instead of
// inserting the placeholder default from addBonusTier above and then
// immediately overwriting it.
export async function addBonusTierWithValues(supabase: SupabaseClient, campaignId: string, views: number, bonus: number) {
  const { data, error } = await supabase.from("bonus_tiers").insert({ campaign_id: campaignId, views, bonus }).select().single();
  if (error) throw error;
  return { id: data.id, views: data.views, bonus: data.bonus } as BonusTier;
}

export async function updateBonusTier(supabase: SupabaseClient, tierId: string, field: "views" | "bonus", value: number) {
  const { error } = await supabase.from("bonus_tiers").update({ [field]: value }).eq("id", tierId);
  if (error) throw error;
}

export async function removeBonusTier(supabase: SupabaseClient, tierId: string) {
  const { error } = await supabase.from("bonus_tiers").delete().eq("id", tierId);
  if (error) throw error;
}

export async function updateKpiField(supabase: SupabaseClient, clientId: string, field: keyof UgcKpi, value: number) {
  const column = {
    goal: "ugc_kpi_goal",
    ratePerDeal: "ugc_kpi_rate_per_deal",
    closingRate: "ugc_kpi_closing_rate",
    responseRate: "ugc_kpi_response_rate",
  }[field];
  const { error } = await supabase.from("clients").update({ [column]: value }).eq("id", clientId);
  if (error) throw error;
}
