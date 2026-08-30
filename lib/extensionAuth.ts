// lib/extensionAuth.ts
//
// Token auth for the browser extension.
//
// The extension runs on instagram.com and tiktok.com, so it has no session
// to borrow — our cookies don't travel there, and bundling the anon key
// into an extension would hand every installer a credential that reaches
// the whole API. Instead each client gets one opaque token, pasted into the
// extension once, and the two extension routes check it explicitly.
//
// The token is looked up with the service-role client on purpose: no RLS
// policy exposes the column, so a client-side query can never read another
// client's token, and the only way to spend one is through a route that
// deliberately accepts it.

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export interface ExtensionClient {
  id: string;
  name: string;
  organizationId: string;
}

// 32 bytes of urlsafe base64. Prefixed so a leaked one is recognisable in a
// log or a screenshot as belonging to us, and searchable if it ever needs
// revoking in bulk.
export function generateExtensionToken(): string {
  return `clx_${randomBytes(24).toString("base64url")}`;
}

export async function clientForExtensionToken(token: string | null): Promise<ExtensionClient | null> {
  const trimmed = (token || "").trim();
  // Length-checked before hitting the database so a blank or obviously
  // malformed header doesn't become a query.
  if (!trimmed.startsWith("clx_") || trimmed.length < 20) return null;

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("clients")
    .select("id, name, organization_id")
    .eq("extension_token", trimmed)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, name: data.name, organizationId: data.organization_id };
}

// Extension requests come from instagram.com and tiktok.com, which are
// cross-origin by definition. Kept to the two hosts the extension actually
// runs on rather than "*", so these routes aren't callable from any page a
// client happens to have open.
export const EXTENSION_ORIGINS = [
  "https://www.instagram.com",
  "https://instagram.com",
  "https://www.tiktok.com",
  "https://tiktok.com",
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && EXTENSION_ORIGINS.includes(origin) ? origin : EXTENSION_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type, X-Extension-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}
