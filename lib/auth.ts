// lib/auth.ts
//
// Real server-side enforcement of the exact same role rules the prototype
// implemented client-side only (see the Limitations doc, item 9 — "anything
// client-side can be manipulated by anyone with dev tools open"). Every
// Claude-powered route calls this first; if it doesn't return { ok: true },
// the route refuses to run, full stop.

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Per-client monthly cap on Claude-powered routes (app/api/claude/*). The
// Anthropic Console spending limit protects total org spend but doesn't stop
// one client from eating a disproportionate share of it — this is the
// per-client backstop. Call count, not token/cost, is enough precision here.
// TODO: confirm this default with Akira once the app has real usage data.
const AI_MONTHLY_CALL_CAP = 200;

export async function requireClientAccess(req: NextRequest, clientId: string) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (profileError) return { ok: false as const, status: 500, error: profileError.message };
  if (!profile) return { ok: false as const, status: 403, error: "No profile found" };

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, organization_id")
    .eq("id", clientId)
    .single();
  if (clientError) return { ok: false as const, status: 500, error: clientError.message };
  if (!client || client.organization_id !== profile.organization_id) {
    return { ok: false as const, status: 403, error: "Client not found in your organization" };
  }

  // Same rule the prototype's UI enforced, now actually enforced server-side:
  // - Admin: unrestricted within their org
  // - Client: only their own client_id
  // - VA/Editor, Creative Director: only clients explicitly granted via account_client_access
  if (profile.role === "Admin") {
    return { ok: true as const, supabase, organizationId: profile.organization_id, profile };
  }
  if (profile.role === "Client") {
    if (profile.client_id !== clientId) return { ok: false as const, status: 403, error: "Not your portal" };
    return { ok: true as const, supabase, organizationId: profile.organization_id, profile };
  }
  // VA/Editor or Creative Director
  const { data: grant, error: grantError } = await supabase
    .from("account_client_access")
    .select("*")
    .eq("profile_id", profile.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (grantError) return { ok: false as const, status: 500, error: grantError.message };
  if (!grant) return { ok: false as const, status: 403, error: "Not granted access to this client" };

  return { ok: true as const, supabase, organizationId: profile.organization_id, profile };
}

// Call after requireClientAccess succeeds and before the route hits the
// Anthropic API. Sums this client's ai_usage_log rows for the current
// calendar month; once they're at/over the cap, the route should return this
// error instead of calling Claude.
export async function checkAiUsageCap(
  supabase: SupabaseClient,
  clientId: string,
  cap: number = AI_MONTHLY_CALL_CAP
) {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", startOfMonth.toISOString());

  // Fail CLOSED, not open — this is the actual spend guardrail. If we can't
  // verify usage, don't guess "under the cap" and let an Anthropic call
  // through anyway; that's exactly the runaway-spend scenario this exists
  // to prevent.
  if (error) {
    return { ok: false as const, status: 500, error: "Couldn't verify AI usage — try again in a moment" };
  }

  if ((count ?? 0) >= cap) {
    return {
      ok: false as const,
      status: 429,
      error: "You've hit your monthly AI usage limit — contact your coach",
    };
  }
  return { ok: true as const };
}

// Call once the Claude API call has actually succeeded (not on auth/validation
// failures before it, and not if Claude itself errors) so the cap tracks real
// usage against the account-wide spend it's meant to protect.
export async function logAiUsage(supabase: SupabaseClient, clientId: string, route: string) {
  await supabase.from("ai_usage_log").insert({ client_id: clientId, route });
}
