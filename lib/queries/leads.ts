// lib/queries/leads.ts
//
// Reads and edits for the lead tracker. Admin-only by RLS — these are
// prospects, and no client has any business seeing the list.
//
// Capture is not here: it comes from the public funnel through
// /api/leads/capture, which is the only unauthenticated write in the app.

import type { SupabaseClient } from "@supabase/supabase-js";

export const LEAD_STAGES = ["New", "Dialed", "Qualified", "Booked", "No Close", "Junk"] as const;
export const LEAD_QUALITIES = ["Excellent", "Mid", "Low"] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadQuality = (typeof LEAD_QUALITIES)[number];

export interface Lead {
  id: string;
  firstName: string;
  email: string;
  phone: string | null;
  instagramHandle: string | null;
  ugcGoal: string | null;
  experienceLevel: string | null;
  biggestBlocker: string | null;
  followersBand: string | null;
  sourceSlug: string | null;
  stage: LeadStage;
  quality: LeadQuality | null;
  dialed: boolean;
  dialedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface LeadSource {
  id: string;
  slug: string;
  label: string;
  destinationUrl: string | null;
  createdAt: string;
  // Filled in by the page from the lead list rather than a join — one query
  // over a few hundred rows beats a correlated count per source.
  leadCount?: number;
}

function mapLead(r: any): Lead {
  return {
    id: r.id,
    firstName: r.first_name,
    email: r.email,
    phone: r.phone,
    instagramHandle: r.instagram_handle,
    ugcGoal: r.ugc_goal,
    experienceLevel: r.experience_level,
    biggestBlocker: r.biggest_blocker,
    followersBand: r.followers_band,
    sourceSlug: r.source_slug,
    stage: r.stage,
    quality: r.quality,
    dialed: !!r.dialed,
    dialedAt: r.dialed_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export async function fetchLeads(supabase: SupabaseClient): Promise<Lead[]> {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data || []).map(mapLead);
}

export async function fetchLeadSources(supabase: SupabaseClient): Promise<LeadSource[]> {
  const { data } = await supabase
    .from("lead_sources")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data || []).map((r: any) => ({
    id: r.id,
    slug: r.slug,
    label: r.label,
    destinationUrl: r.destination_url,
    createdAt: r.created_at,
  }));
}

// Slugs end up in a URL someone types or pastes into a bio, so they're kept
// to lowercase, digits and dashes — anything else invites an encoding bug
// between the post and the funnel.
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createLeadSource(
  supabase: SupabaseClient,
  organizationId: string,
  label: string,
  destinationUrl: string | null
): Promise<LeadSource> {
  const { data, error } = await supabase
    .from("lead_sources")
    .insert({
      organization_id: organizationId,
      slug: slugify(label),
      label: label.trim(),
      destination_url: destinationUrl?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { id: data.id, slug: data.slug, label: data.label, destinationUrl: data.destination_url, createdAt: data.created_at };
}

export async function archiveLeadSource(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("lead_sources")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// Dialing stamps its own time. Recording *that* someone was called without
// recording when is the kind of gap that makes a follow-up cadence
// impossible to run later.
export async function updateLead(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{ stage: LeadStage; quality: LeadQuality | null; dialed: boolean; notes: string }>
) {
  const row: Record<string, unknown> = { ...patch };
  if (patch.dialed !== undefined) row.dialed_at = patch.dialed ? new Date().toISOString() : null;

  const { error } = await supabase.from("leads").update(row).eq("id", id);
  if (error) throw error;
}

export async function removeLead(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("leads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
