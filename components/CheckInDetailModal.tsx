"use client";

// components/CheckInDetailModal.tsx — ported verbatim from the prototype.

import React from "react";
import { C } from "@/lib/theme";
import { Modal, Badge } from "@/components/ui";
import { formatWeekLabel } from "@/lib/helpers";
import type { WeeklyLog } from "@/lib/helpers";

export default function CheckInDetailModal({ log, onClose }: { log: WeeklyLog; onClose: () => void }) {
  const cash = log.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0) + (log.ugcOneOff || 0);
  const videos = log.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0);
  const row = (label: string, value: React.ReactNode) =>
    value === undefined || value === null || value === "" ? null : (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{value}</div>
      </div>
    );
  return (
    <Modal title={`Check-in — week of ${formatWeekLabel(log.weekOf)}`} onClose={onClose} width={520}>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <Badge tone="accent">{videos} videos</Badge>
        <Badge tone="success">${cash.toLocaleString()}</Badge>
        {log.energyLevel != null && (
          <Badge tone={log.energyLevel >= 7 ? "success" : log.energyLevel >= 4 ? "warning" : "default"}>Energy {log.energyLevel}/10</Badge>
        )}
      </div>

      {log.campaignEntries.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>By campaign</div>
          <div style={{ display: "grid", gap: 6 }}>
            {log.campaignEntries.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: C.surface2, borderRadius: 8, padding: "7px 10px", fontSize: 12.5 }}>
                <span>{e.campaignBrand}</span>
                <span className="cl-mono" style={{ color: C.textMuted }}>
                  {e.videosFilmed || 0} videos · ${((e.amountEarned || 0) + (e.bonusEarned || 0)).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {row("What went well", log.wentWell)}
      {row("What could've been better", log.couldImprove)}
      {row("Deep work hours", log.deepWorkHours)}
      {(log.outreachSent || log.outreachFollowUps || log.dealsClosed) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>Outreach funnel</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12.5 }}>
            <span>{log.outreachSent || 0} pitched</span>
            <span>{log.outreachFollowUps || 0} followed up</span>
            <span>{log.dealsClosed || 0} closed</span>
          </div>
        </div>
      )}
      {row("Biggest roadblock", log.roadblock)}
      {row("How they're combating it", log.roadblockAction)}
      {row("Grateful / proud of", log.gratitude)}
      {row("Tasks next week", log.nextWeekTasks)}
      {!log.wentWell && !log.roadblock && !log.gratitude && (
        <div style={{ fontSize: 12.5, color: C.textFaint, fontStyle: "italic" }}>Only the numbers were logged this week — no written reflection.</div>
      )}
    </Modal>
  );
}
