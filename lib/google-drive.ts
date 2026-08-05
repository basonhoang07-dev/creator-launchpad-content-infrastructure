// lib/google-drive.ts
//
// SERVER-SIDE ONLY. Talks to Google's OAuth + Drive REST APIs directly with
// plain fetch (no googleapis SDK dependency) — same lightweight style as the
// rest of this codebase's server routes.
//
// Each client connects their OWN Google Drive (OAuth), not a shared
// service-account Drive: a Google service account has no storage quota of
// its own on a personal Gmail account, so creating folders on the client's
// behalf that way fails outright. Routing through the client's own OAuth
// grant instead avoids that wall entirely and costs nothing extra.

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const MASTER_FOLDER_NAME = "File For Editor";

export const DRIVE_OAUTH_SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email", "openid"].join(" ");

export function driveOAuthConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function buildAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    // Forces Google to return a refresh_token even if this Google account
    // connected before — without it, re-connecting after a disconnect
    // silently comes back with no refresh_token at all.
    prompt: "consent",
    scope: DRIVE_OAUTH_SCOPES,
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

// Returns a valid access token for this client's Drive connection,
// refreshing and persisting it first if expired. Null if never connected.
async function getValidAccessToken(clientId: string): Promise<{ accessToken: string; rootFolderId: string | null } | null> {
  const admin = createAdminSupabaseClient();
  const { data: conn, error } = await admin.from("google_drive_connections").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw error;
  if (!conn) return null;

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  // 60s buffer so a token about to expire mid-request still gets refreshed.
  if (conn.access_token && expiresAt > Date.now() + 60_000) {
    return { accessToken: conn.access_token, rootFolderId: conn.root_folder_id };
  }

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const expiresAtIso = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin.from("google_drive_connections").update({ access_token: refreshed.access_token, access_token_expires_at: expiresAtIso }).eq("client_id", clientId);
  return { accessToken: refreshed.access_token, rootFolderId: conn.root_folder_id };
}

async function driveRequest(accessToken: string, pathAndQuery: string, init?: RequestInit) {
  const res = await fetch(`${DRIVE_FILES_URL}${pathAndQuery}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Google Drive request failed");
  return json;
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string | null): Promise<{ id: string; url: string }> {
  const escapedName = name.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`;
  const q = `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
  const list = await driveRequest(accessToken, `?q=${encodeURIComponent(q)}&fields=files(id,webViewLink)&spaces=drive`);
  if (list.files?.length > 0) return { id: list.files[0].id, url: list.files[0].webViewLink };

  const created = await driveRequest(accessToken, `?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
  });
  return { id: created.id, url: created.webViewLink };
}

// Ensures "File For Editor / {campaign brand} / {script title}" exists in
// this client's own Drive, creating whichever levels don't exist yet, and
// returns the new script-level folder's shareable link — or null if this
// client has never connected Drive (a safe no-op, not an error). Caches the
// root and per-campaign folder ids so repeat scripts under the same
// client+brand don't re-search Drive every time.
export async function ensureScriptFolder(clientId: string, brand: string, scriptTitle: string): Promise<string | null> {
  const conn = await getValidAccessToken(clientId);
  if (!conn) return null;
  const admin = createAdminSupabaseClient();

  let rootFolderId = conn.rootFolderId;
  if (!rootFolderId) {
    const root = await findOrCreateFolder(conn.accessToken, MASTER_FOLDER_NAME, null);
    rootFolderId = root.id;
    await admin.from("google_drive_connections").update({ root_folder_id: rootFolderId }).eq("client_id", clientId);
  }

  const { data: campaign } = await admin.from("retainer_campaigns").select("id, drive_folder_id").eq("client_id", clientId).eq("brand", brand).maybeSingle();

  let campaignFolderId = campaign?.drive_folder_id || null;
  if (!campaignFolderId) {
    const campaignFolder = await findOrCreateFolder(conn.accessToken, brand, rootFolderId);
    campaignFolderId = campaignFolder.id;
    if (campaign?.id) {
      await admin.from("retainer_campaigns").update({ drive_folder_id: campaignFolder.id, drive_folder_url: campaignFolder.url }).eq("id", campaign.id);
    }
  }

  // Always create fresh here (never find-or-create) — two scripts can
  // legitimately share a title, and Drive itself allows duplicate names.
  const scriptFolder = await driveRequest(conn.accessToken, `?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name: scriptTitle, mimeType: "application/vnd.google-apps.folder", parents: [campaignFolderId] }),
  });
  return scriptFolder.webViewLink as string;
}

export async function disconnectDrive(clientId: string) {
  const admin = createAdminSupabaseClient();
  await admin.from("google_drive_connections").delete().eq("client_id", clientId);
  await admin.from("integrations").update({ connected: false, connected_email: null }).eq("client_id", clientId).eq("integration_key", "drive");
}
