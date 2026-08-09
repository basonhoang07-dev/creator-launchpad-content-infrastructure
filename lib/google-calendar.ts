// lib/google-calendar.ts
//
// SERVER-SIDE ONLY. Same lightweight plain-fetch style as lib/google-drive.ts
// (no googleapis SDK), talking to Google's OAuth + Calendar v3 REST APIs
// directly. Each client connects their OWN Google Calendar (OAuth) — same
// reasoning as Drive: this app never holds a shared service-account
// calendar, it acts on the client's own, with their own consent.
//
// Two directions this powers:
//   - sync OUT: an availability_blocks row becomes a real event on the
//     client's Google Calendar (created once, kept in sync on edit/delete).
//   - sync IN: their existing Calendar events (meetings, etc.) get listed
//     read-only so they show up alongside availability in the app.

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const CALENDAR_OAUTH_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email", "openid"].join(
  " "
);

export function calendarOAuthConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function buildAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    // Forces a refresh_token back even on a re-connect — see google-drive.ts,
    // same reasoning applies here.
    prompt: "consent",
    scope: CALENDAR_OAUTH_SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Google token exchange failed");
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Google token refresh failed");
  return json as { access_token: string; expires_in: number };
}

export async function fetchGoogleEmail(accessToken: string) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("Couldn't read the connected Google account's email");
  const json = await res.json();
  return json.email as string;
}

async function getValidAccessToken(clientId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data: conn, error } = await admin.from("google_calendar_connections").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw error;
  if (!conn) return null;

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  if (conn.access_token && expiresAt > Date.now() + 60_000) {
    return conn.access_token;
  }

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const expiresAtIso = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin.from("google_calendar_connections").update({ access_token: refreshed.access_token, access_token_expires_at: expiresAtIso }).eq("client_id", clientId);
  return refreshed.access_token;
}

async function calendarRequest(accessToken: string, pathAndQuery: string, init?: RequestInit) {
  const res = await fetch(`${EVENTS_URL}${pathAndQuery}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Google Calendar request failed");
  return json;
}

function recurrenceRule(freq: string): string[] | undefined {
  if (freq === "daily") return ["RRULE:FREQ=DAILY"];
  if (freq === "weekly") return ["RRULE:FREQ=WEEKLY"];
  if (freq === "weekday") return ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"];
  return undefined;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function buildEventBody(block: { label: string; block_date: string; all_day: boolean; start_time?: string | null; end_time?: string | null; repeat_freq: string }, timeZone: string) {
  const body: Record<string, unknown> = {
    summary: `${block.label} (Creator Launchpad)`,
    recurrence: recurrenceRule(block.repeat_freq),
  };
  if (block.all_day) {
    body.start = { date: block.block_date };
    body.end = { date: addDays(block.block_date, 1) }; // Google's all-day end date is exclusive.
  } else {
    body.start = { dateTime: `${block.block_date}T${block.start_time || "09:00"}:00`, timeZone };
    body.end = { dateTime: `${block.block_date}T${block.end_time || "17:00"}:00`, timeZone };
  }
  return body;
}

// Creates (first sync) or updates (already has a google_event_id) the
// Calendar event for one availability block. Returns the event id to store
// back on the block row, or null if this client has never connected
// Calendar (a safe no-op, not an error).
export async function syncAvailabilityBlock(
  clientId: string,
  block: { google_event_id?: string | null; label: string; block_date: string; all_day: boolean; start_time?: string | null; end_time?: string | null; repeat_freq: string },
  timeZone: string
): Promise<string | null> {
  const accessToken = await getValidAccessToken(clientId);
  if (!accessToken) return null;

  const body = buildEventBody(block, timeZone);
  if (block.google_event_id) {
    const updated = await calendarRequest(accessToken, `/${block.google_event_id}`, { method: "PATCH", body: JSON.stringify(body) });
    return updated.id as string;
  }
  const created = await calendarRequest(accessToken, "", { method: "POST", body: JSON.stringify(body) });
  return created.id as string;
}

// Silently no-ops if never connected, or the event's already gone — deleting
// an availability block shouldn't fail just because its Calendar event was
// already removed by hand.
export async function deleteAvailabilityEvent(clientId: string, googleEventId: string): Promise<void> {
  const accessToken = await getValidAccessToken(clientId);
  if (!accessToken) return;
  try {
    await calendarRequest(accessToken, `/${googleEventId}`, { method: "DELETE" });
  } catch {
    // Already gone, or the client revoked access — nothing more to do.
  }
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, the event's (or occurrence's) start date
  time: string | null; // "HH:MM", null for all-day
  allDay: boolean;
}

// Read-only pull of the client's own upcoming Calendar events (their real
// meetings, etc.) for a date range — never anything this app itself pushed
// (those already show as availability blocks, no need to double-render).
export async function listUpcomingEvents(clientId: string, startDate: string, endDate: string): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken(clientId);
  if (!accessToken) return [];

  const params = new URLSearchParams({
    timeMin: `${startDate}T00:00:00Z`,
    timeMax: `${endDate}T23:59:59Z`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const list = await calendarRequest(accessToken, `?${params.toString()}`);
  const items = (list?.items || []) as any[];
  return items
    .filter((e) => e.summary && !(e.summary as string).endsWith("(Creator Launchpad)"))
    .map((e) => {
      const allDay = !!e.start?.date;
      const raw: string = e.start?.date || e.start?.dateTime || "";
      const date = raw.slice(0, 10);
      const time = allDay ? null : raw.slice(11, 16);
      return { id: e.id as string, title: e.summary as string, date, time, allDay };
    })
    .filter((e) => e.date);
}

export async function disconnectCalendar(clientId: string) {
  const admin = createAdminSupabaseClient();
  await admin.from("google_calendar_connections").delete().eq("client_id", clientId);
  await admin.from("integrations").update({ connected: false, connected_email: null }).eq("client_id", clientId).eq("integration_key", "gcal");
}
