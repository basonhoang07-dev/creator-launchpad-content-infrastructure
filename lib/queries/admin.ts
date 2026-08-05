// lib/queries/admin.ts
//
// Fetch + mutation helpers for the Admin Panel. Accounts are real `profiles`
// rows; "accessibleClients" (a name array on the prototype's in-memory
// account) is now the real account_client_access join table, keyed by
// client id, not name.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";
import type { WeeklyLog } from "@/lib/helpers";
import type { Role } from "@/lib/theme";

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "approved";
  clientId: string | null;
}

export async function fetchAccounts(supabase: SupabaseClient, organizationId: string): Promise<AdminAccount[]> {
  const { data } = await supabase.from("profiles").select("id, name, email, role, status, client_id").eq("organization_id", organizationId);
  return (data || []).map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, clientId: r.client_id }));
}

// Direct path for an Admin who already knows a client's info — creates the
// real account immediately instead of waiting on a self-serve request.
export async function addClient(name: string, email: string) {
  const res = await fetch("/api/admin/add-client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't add that client");
  return json as { ok: true; clientId: string };
}

// Pending SIGN-UP is now handled by access_requests, not a 'pending' profiles
// row — no real account exists until an Admin approves a request (see
// approveAccessRequest below), so there is no separate "approve" action on an
// existing profile anymore.

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export async function fetchAccessRequests(supabase: SupabaseClient, organizationId: string): Promise<AccessRequest[]> {
  const { data } = await supabase
    .from("access_requests")
    .select("id, name, email, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data || []).map((r) => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at }));
}

// The only place a real account gets created from a request — goes through
// app/api/admin/approve-request since inviting a real Supabase Auth user
// requires the service-role key.
export async function approveAccessRequest(requestId: string) {
  const res = await fetch("/api/admin/approve-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't approve that request");
}

export async function denyAccessRequest(supabase: SupabaseClient, requestId: string) {
  const { error } = await supabase.from("access_requests").update({ status: "denied" }).eq("id", requestId);
  if (error) throw error;
}

// Removes the account for real — profile row AND the underlying Supabase
// Auth login. Goes through app/api/admin/remove-account since deleting an
// auth user requires the service-role key, not something the anon-key
// browser client can do.
export async function removeAccount(id: string) {
  const res = await fetch("/api/admin/remove-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't remove the account");
  return json as { ok: true; warning?: string };
}

export interface RosterClient {
  id: string;
  name: string;
}

export async function fetchClientRoster(supabase: SupabaseClient, organizationId: string): Promise<RosterClient[]> {
  const { data } = await supabase.from("clients").select("id, name").eq("organization_id", organizationId).order("name");
  return data || [];
}

export async function fetchAccessGrants(supabase: SupabaseClient, profileId: string): Promise<string[]> {
  // Must throw rather than default to [] on error — this feeds the Admin
  // Panel's grant checkboxes, and "no access" on a failed query looks
  // identical to "actually revoked," which could lead an Admin to toggle a
  // checkbox that fires a real revokeClientAccess call on a client that
  // still had access all along.
  const { data, error } = await supabase.from("account_client_access").select("client_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data || []).map((r) => r.client_id);
}

export async function grantClientAccess(supabase: SupabaseClient, profileId: string, clientId: string) {
  const { error } = await supabase.from("account_client_access").insert({ profile_id: profileId, client_id: clientId });
  if (error) throw error;
}
export async function revokeClientAccess(supabase: SupabaseClient, profileId: string, clientId: string) {
  const { error } = await supabase.from("account_client_access").delete().eq("profile_id", profileId).eq("client_id", clientId);
  if (error) throw error;
}

export interface ClientRecapMapping {
  id: string;
  name: string;
  googleMeetEmail: string;
  discordChannelId: string;
}

// Powers the Admin Panel's "Recap Delivery" tab — every client, one row
// each, editable in place. This is the single place both fields that make
// automatic recap delivery work get set: the email that matches an incoming
// Fathom call to a client, and which Discord channel it posts to. Replaces
// what used to be a per-client modal (open one client, edit, save, close,
// repeat) — with 19+ real clients that didn't scale.
//
// discord_webhook_url still exists as a column (the old no-bot fallback)
// but isn't surfaced here now that the bot is actually configured — it was
// never anything but a fallback, and one fewer field is one fewer thing to
// figure out.
export async function fetchClientRecapMappings(supabase: SupabaseClient, organizationId: string): Promise<ClientRecapMapping[]> {
  const { data, error } = await supabase.from("clients").select("id, name, google_meet_email, discord_channel_id").eq("organization_id", organizationId).order("name");
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.name, googleMeetEmail: r.google_meet_email || "", discordChannelId: r.discord_channel_id || "" }));
}

export async function updateClientRecapMapping(supabase: SupabaseClient, clientId: string, fields: { googleMeetEmail: string; discordChannelId: string }) {
  const { error } = await supabase
    .from("clients")
    .update({ google_meet_email: fields.googleMeetEmail.trim(), discord_channel_id: fields.discordChannelId.trim() })
    .eq("id", clientId);
  if (error) throw error;
}

export interface DiscordChannel {
  id: string;
  name: string;
}

// Proxies through /api/admin/discord-channels since DISCORD_BOT_TOKEN is a
// server-only secret the browser can't hold. Returns [] (not a throw) on
// failure — the picker just falls back to showing only the manual-entry
// field, same as if Discord auto-discovery were never configured at all.
export async function fetchDiscordChannels(): Promise<DiscordChannel[]> {
  try {
    const res = await fetch("/api/admin/discord-channels");
    if (!res.ok) return [];
    const json = await res.json();
    return json.channels || [];
  } catch {
    return [];
  }
}

export async function postAnnouncement(supabase: SupabaseClient, organizationId: string, body: string) {
  const { error } = await supabase.from("announcements").insert({ organization_id: organizationId, body: body.trim() });
  if (error) throw error;
}

export async function fetchWeeklyLogHistory(supabase: SupabaseClient, clientId: string): Promise<WeeklyLog[]> {
  const { data } = await supabase.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").eq("client_id", clientId).order("week_of", { ascending: false });
  return (data || []).map((row) => mapWeeklyLogRow(row as WeeklyLogRow));
}
