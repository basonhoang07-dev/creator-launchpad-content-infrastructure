"use client";

// components/useDefaultClient.ts
//
// The prototype's single global `data` blob meant every role implicitly saw
// "the one client" on Home, Needs-You-Now, etc. The real schema is properly
// per-client, and only Client (their own client_id) and Creative Director
// (the "Working in" picker) have an explicit client-scoping UI today. Since
// this is explicitly a single-org, effectively-single-client deployment for
// now (per the launch checklist), Admin and VA/Editor auto-scope to the
// org's first client rather than showing an empty Home page. When a second
// client is ever added, Admin/VA-Editor will need their own picker UI (like
// the Creative Director's) — this hook is the seam where that gets wired in.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useSession, useScopedClientId } from "@/components/SessionProvider";

export function useDefaultScopedClientId(): string | null {
  const { profile } = useSession();
  const explicit = useScopedClientId();
  const [autoClientId, setAutoClientId] = useState<string | null>(null);

  useEffect(() => {
    if (explicit) return;
    if (profile.role !== "Admin" && profile.role !== "VA/Editor") return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setAutoClientId(data?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [explicit, profile.role, profile.organization_id]);

  return explicit || autoClientId;
}
