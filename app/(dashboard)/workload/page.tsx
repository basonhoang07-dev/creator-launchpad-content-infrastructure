"use client";

// app/(dashboard)/workload/page.tsx — role-aware Workload dispatcher, ported
// from the prototype's WorkloadPage.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeader, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { fetchWorkloadData, type WorkloadData } from "@/lib/queries/workload";
import EditorWorkloadPage from "@/components/workload/EditorWorkloadPage";
import ScriptingNeedsPage from "@/components/workload/ScriptingNeedsPage";
import FilmingNeedsPage from "@/components/workload/FilmingNeedsPage";

export default function WorkloadPage() {
  const clientId = useDefaultScopedClientId();
  return clientId ? <WorkloadInner clientId={clientId} /> : <div style={{ color: "#8F8F8F", fontSize: 14 }}>Loading…</div>;
}

function WorkloadInner({ clientId }: { clientId: string }) {
  const { profile } = useSession();
  const router = useRouter();
  const [data, setData] = useState<WorkloadData | null>(null);
  const [adminTab, setAdminTab] = useState<"editors" | "scripting" | "filming">("editors");

  const reload = useCallback(async () => {
    const supabase = createClient();
    setData(await fetchWorkloadData(supabase, clientId));
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!data) return <div style={{ color: "#8F8F8F", fontSize: 14 }}>Loading…</div>;

  function onNavigateToBrand(brand: string, view: string) {
    router.push(`/calendar?brand=${encodeURIComponent(brand)}&view=${view}`);
  }

  if (profile.role === "Client") return <FilmingNeedsPage data={data} onNavigateToBrand={onNavigateToBrand} />;
  if (profile.role === "Creative Director") return <ScriptingNeedsPage data={data} onNavigateToBrand={onNavigateToBrand} />;
  if (profile.role === "VA/Editor") return <EditorWorkloadPage data={data} onNavigateToBrand={onNavigateToBrand} />;

  return (
    <div>
      <SectionHeader
        eyebrow="Full visibility"
        title="Team Workload"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant={adminTab === "editors" ? "primary" : "secondary"} size="sm" onClick={() => setAdminTab("editors")}>By editor</Button>
            <Button variant={adminTab === "scripting" ? "primary" : "secondary"} size="sm" onClick={() => setAdminTab("scripting")}>Scripting needs</Button>
            <Button variant={adminTab === "filming" ? "primary" : "secondary"} size="sm" onClick={() => setAdminTab("filming")}>Filming needs</Button>
          </div>
        }
      />
      {adminTab === "editors" && <EditorWorkloadPage data={data} hideHeader onNavigateToBrand={onNavigateToBrand} />}
      {adminTab === "scripting" && <ScriptingNeedsPage data={data} hideHeader onNavigateToBrand={onNavigateToBrand} />}
      {adminTab === "filming" && <FilmingNeedsPage data={data} hideHeader onNavigateToBrand={onNavigateToBrand} />}
    </div>
  );
}
