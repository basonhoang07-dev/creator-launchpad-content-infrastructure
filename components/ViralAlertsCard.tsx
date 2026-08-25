"use client";

// components/ViralAlertsCard.tsx
//
// Home page surface for Viral Alerts — shows tracked-creator videos that
// crossed their views/24h threshold since they were last dismissed. Renders
// nothing at all when there's nothing firing, so it never takes up space on
// a quiet day.
//
// Read-only here: creators are managed, and checks are run, from the Content
// Calendar's Viral Alerts tab.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Flame, X } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { fetchViralAlerts, dismissViralAlert, type ViralAlertVideo } from "@/lib/queries/viralAlerts";
import { formatVelocity } from "@/lib/viralAlerts";
import { useToast, toastMessage } from "@/components/Toast";

export default function ViralAlertsCard({ clientId }: { clientId: string }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [alerts, setAlerts] = useState<ViralAlertVideo[]>([]);

  const reload = useCallback(async () => {
    setAlerts(await fetchViralAlerts(createClient(), clientId, 5));
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function dismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await dismissViralAlert(createClient(), id);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't dismiss that alert — try again."));
      reload();
    }
  }

  if (alerts.length === 0) return null;

  return (
    <Card style={{ marginBottom: 16, border: `1px solid ${C.warning}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="cl-mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: "0.1em", color: C.warning, textTransform: "uppercase", fontWeight: 700 }}>
          <Flame size={13} /> Going viral
        </div>
        <button
          onClick={() => router.push("/calendar")}
          style={{ background: "none", border: "none", color: C.textFaint, fontSize: 11.5, cursor: "pointer" }}
        >
          Manage →
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {alerts.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 8, padding: "9px 12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.description || "Untitled video"}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                @{a.creatorHandle}
                {a.brand ? ` · ${a.brand}` : ""}
              </div>
            </div>
            <Badge tone="warning">{formatVelocity(a.velocity)}/24h</Badge>
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: C.accentLight, display: "flex" }} title="Open video">
                <ExternalLink size={14} />
              </a>
            )}
            <button onClick={() => dismiss(a.id)} title="Dismiss" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", display: "flex" }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
