// lib/queries/integrations.ts
//
// Integration metadata (name/description) stays static, same as the
// prototype's DEFAULT_DATA.integrations — the DB only tracks the per-client
// `connected` boolean per integration_key.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface IntegrationMeta {
  id: string;
  name: string;
  desc: string;
  connected: boolean;
}

const INTEGRATION_DEFS: Omit<IntegrationMeta, "connected">[] = [
  { id: "drive", name: "Google Drive", desc: "Auto-creates folders for scripted content" },
  { id: "gcal", name: "Google Calendar", desc: "Syncs your availability so content only gets scheduled when you're free" },
  { id: "bento", name: "Bento", desc: "Brand outreach — external tool" },
  { id: "sandcastles", name: "Sandcastles", desc: "Competitor / outlier research — external tool" },
  { id: "warmr", name: "Warmr", desc: "Auto warm-up for social accounts — external tool" },
  { id: "fathom", name: "Fathom", desc: "Call recordings — transcripts become Recaps automatically" },
];
const DEFAULT_CONNECTED: Record<string, boolean> = {};

export const EXTERNAL_TOOL_URLS: Record<string, string> = {
  bento: "https://www.onbento.com",
  sandcastles: "https://www.sandcastles.ai",
  warmr: "https://warmr.so",
};

export async function fetchIntegrations(supabase: SupabaseClient, clientId: string): Promise<IntegrationMeta[]> {
  const { data } = await supabase.from("integrations").select("integration_key, connected").eq("client_id", clientId);
  const byKey = new Map((data || []).map((r) => [r.integration_key, r.connected]));
  return INTEGRATION_DEFS.map((def) => ({ ...def, connected: byKey.has(def.id) ? !!byKey.get(def.id) : !!DEFAULT_CONNECTED[def.id] }));
}

export async function toggleIntegration(supabase: SupabaseClient, clientId: string, id: string, connected: boolean) {
  const { error } = await supabase.from("integrations").upsert({ client_id: clientId, integration_key: id, connected }, { onConflict: "client_id,integration_key" });
  if (error) throw error;
}
