"use client";

import React from "react";
import { FileText } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Badge, SectionHeader, EmptyState } from "@/components/ui";
import type { WorkloadData } from "@/lib/queries/workload";

export default function ScriptingNeedsPage({
  data,
  hideHeader,
  onNavigateToBrand,
}: {
  data: WorkloadData;
  hideHeader?: boolean;
  onNavigateToBrand?: (brand: string, view: string) => void;
}) {
  const boards = data.brands.map((brand) => {
    const campaign = data.campaigns.find((c) => c.brand === brand);
    const dailyVolume = campaign ? Number(campaign.maxPosts) || 0 : 0;
    const boardEntries = data.entries.filter((c) => c.brand === brand);
    const unscripted = boardEntries.filter((c) => (c.status || "Unscripted") === "Unscripted").length;
    const readyBuffer = boardEntries.filter((c) => !c.date && (c.status || "Unscripted") !== "Unscripted").length;
    const behind = dailyVolume > 0 && readyBuffer < dailyVolume;
    return { brand, dailyVolume, unscripted, readyBuffer, behind };
  });

  return (
    <div>
      {!hideHeader && <SectionHeader eyebrow="Stay ahead of filming" title="Scripting Needs" />}
      <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 20, lineHeight: 1.5, maxWidth: 640 }}>
        How much script each brand needs, based on its daily filming volume. Keep the ready buffer at or above the daily need so filming days never show up short-scripted.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {boards.map((b) => (
          <Card key={b.brand}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{b.brand}</div>
              {b.dailyVolume > 0 ? <Badge tone={b.behind ? "warning" : "success"}>{b.behind ? "Behind" : "On pace"}</Badge> : <Badge>No KPI set</Badge>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <div className="cl-mono" style={{ fontSize: 22, fontWeight: 700 }}>{b.dailyVolume}</div>
                <div style={{ fontSize: 10.5, color: C.textFaint }}>scripts needed/day</div>
              </div>
              <div>
                <div className="cl-mono" style={{ fontSize: 22, fontWeight: 700, color: b.behind ? C.warning : C.success }}>{b.readyBuffer}</div>
                <div style={{ fontSize: 10.5, color: C.textFaint }}>ready buffer</div>
              </div>
              <div>
                <div className="cl-mono" style={{ fontSize: 22, fontWeight: 700, color: b.unscripted ? C.accentLight : C.text }}>{b.unscripted}</div>
                <div style={{ fontSize: 10.5, color: C.textFaint }}>unscripted backlog</div>
              </div>
            </div>
            {onNavigateToBrand && (
              <Button size="sm" variant="secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => onNavigateToBrand(b.brand, "table")}>
                <FileText size={13} /> View scripts to make
              </Button>
            )}
          </Card>
        ))}
        {boards.length === 0 && <EmptyState icon={FileText} text="No brand boards yet." />}
      </div>
    </div>
  );
}
