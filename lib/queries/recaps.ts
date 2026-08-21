// lib/queries/recaps.ts
//
// Fetch + mutation helpers for Call Recaps. Generation itself happens
// server-side (app/api/claude/generate-recap) — that route both calls Claude
// and persists the recap + action items + decisions in one step, so the
// client only fetches/reads and toggles action items here.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActionItem {
  id: string;
  text: string;
  due: string | null;
  done: boolean;
}

export interface Recap {
  id: string;
  title: string;
  date: string;
  attendeeEmail: string | null;
  tldr: string;
  recordingUrl: string | null;
  actionItems: ActionItem[];
  decisions: string[];
}

function mapRow(row: any): Recap {
  return {
    id: row.id,
    title: row.title,
    date: row.recap_date,
    attendeeEmail: row.attendee_email,
    tldr: row.tldr || "",
    recordingUrl: row.recording_url,
    actionItems: (row.recap_action_items || []).map((a: any) => ({ id: a.id, text: a.body, due: a.due, done: a.done })),
    decisions: (row.recap_decisions || []).map((d: any) => d.body),
  };
}

export async function fetchRecaps(supabase: SupabaseClient, clientId: string): Promise<Recap[]> {
  const { data } = await supabase
    .from("recaps")
    .select("*, recap_action_items(*), recap_decisions(*)")
    .eq("client_id", clientId)
    .order("recap_date", { ascending: false });
  return (data || []).map(mapRow);
}

export async function toggleActionItem(supabase: SupabaseClient, itemId: string, done: boolean) {
  const { error } = await supabase.from("recap_action_items").update({ done }).eq("id", itemId);
  if (error) throw error;
}

// The exact matching logic the real Fathom webhook pipeline would run
// automatically (see the Recap Automation SOP) — ported from the prototype's
// NewRecapModal so it's the same rule whether a human types the attendee
// email in by hand or a webhook reads it off a calendar invite. Case-
// insensitive, and blank input never counts as a match.
export function matchesClientMeetEmail(attendeeEmail: string, clientMeetEmail: string | null | undefined): boolean {
  const attendee = attendeeEmail.trim().toLowerCase();
  const client = (clientMeetEmail || "").trim().toLowerCase();
  return !!attendee && !!client && attendee === client;
}
