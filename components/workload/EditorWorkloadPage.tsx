"use client";

import React, { useState } from "react";
import { CalendarDays, Table2, UserCog } from "lucide-react";
import { C, STATUS_COLORS } from "@/lib/theme";
import { Card, Button, Badge, SectionHeader, EmptyState, inputStyle } from "@/components/ui";
import { useSession } from "@/components/SessionProvider";
import { todayPlus } from "@/lib/helpers";
import type { WorkloadData } from "@/lib/queries/workload";

export default function EditorWorkloadPage({
  data,
  hideHeader,
  onNavigateToBrand,
}: {
  data: WorkloadData;
  hideHeader?: boolean;
  onNavigateToBrand?: (brand: string, view: string) => void;
}) {
  const { profile } = useSession();
  const [selectedEditor, setSelectedEditor] = useState(profile.role === "VA/Editor" ? profile.id : data.editors[0]?.id || "");

  const assigned = data.entries.filter((c) => c.editorProfileId === selectedEditor);
  const byBrand: Record<string, typeof assigned> = {};
  assigned.forEach((c) => {
    byBrand[c.brand] = byBrand[c.brand] || [];
    byBrand[c.brand].push(c);
  });

  const upcoming = assigned.filter((c) => c.date && c.date >= todayPlus(0)).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const noDate = assigned.filter((c) => !c.date);
  const inEditing = assigned.filter((c) => c.status === "Editing");

  const picker = data.editors.length > 0 && (
    <select style={{ ...inputStyle, width: 200 }} value={selectedEditor} onChange={(e) => setSelectedEditor(e.target.value)}>
      {data.editors.map((ed) => (
        <option key={ed.id} value={ed.id}>{ed.name}</option>
      ))}
    </select>
  );

  return (
    <div>
      {!hideHeader && <SectionHeader eyebrow="Across every board" title="My Assignments" action={profile.role === "Admin" ? picker : undefined} />}
      {hideHeader && <div style={{ marginBottom: 16 }}>{picker}</div>}
      {!selectedEditor ? (
        <EmptyState icon={UserCog} text="No VA/Editor accounts yet — invite one from the Admin Panel." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            <Card>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Total assigned</div>
              <div className="cl-display" style={{ fontSize: 30, fontWeight: 700 }}>{assigned.length}</div>
              <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>across {Object.keys(byBrand).length} board{Object.keys(byBrand).length !== 1 ? "s" : ""}</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Currently editing</div>
              <div className="cl-display" style={{ fontSize: 30, fontWeight: 700, color: inEditing.length ? C.accentLight : C.text }}>{inEditing.length}</div>
              <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>marked "Editing" status</div>
            </Card>
            <Card>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>No filming date yet</div>
              <div className="cl-display" style={{ fontSize: 30, fontWeight: 700, color: noDate.length ? C.warning : C.text }}>{noDate.length}</div>
              <div style={{ fontSize: 11, color: C.textFaint, marginTop: 4 }}>waiting to be scheduled</div>
            </Card>
          </div>

          <SectionHeader eyebrow="Coming up" title="Upcoming shoots" />
          <div style={{ display: "grid", gap: 8, marginBottom: 28 }}>
            {upcoming.slice(0, 8).map((c) => {
              const sc = STATUS_COLORS[c.status || "Unscripted"];
              return (
                <Card key={c.id} style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <CalendarDays size={15} color={C.accentLight} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</div>
                    <div style={{ fontSize: 11.5, color: C.textMuted }}>{c.brand} · {c.format}</div>
                  </div>
                  <span className="cl-mono" style={{ background: sc.bg, color: sc.color, fontSize: 10.5, padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>{c.status || "Unscripted"}</span>
                  <Badge>{c.date}</Badge>
                </Card>
              );
            })}
            {upcoming.length === 0 && <EmptyState icon={CalendarDays} text="Nothing scheduled for you right now." />}
          </div>

          <SectionHeader eyebrow="By board" title="Everything assigned to you" />
          <div style={{ display: "grid", gap: 16 }}>
            {Object.entries(byBrand).map(([brand, items]) => (
              <div key={brand}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.accentLight }}>{brand} ({items.length})</span>
                  {onNavigateToBrand && (
                    <Button size="sm" variant="secondary" onClick={() => onNavigateToBrand(brand, "table")} style={{ padding: "3px 9px", fontSize: 11 }}>
                      View board
                    </Button>
                  )}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {items.map((c) => {
                    const sc = STATUS_COLORS[c.status || "Unscripted"];
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 8, padding: "8px 12px" }}>
                        <span style={{ fontSize: 12.5, flex: 1 }}>{c.title}</span>
                        <span className="cl-mono" style={{ background: sc.bg, color: sc.color, fontSize: 10, padding: "2px 7px", borderRadius: 5, fontWeight: 700 }}>{c.status || "Unscripted"}</span>
                        <span style={{ fontSize: 11, color: C.textFaint, minWidth: 80, textAlign: "right" }}>{c.date || "No date"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {Object.keys(byBrand).length === 0 && <EmptyState icon={Table2} text="Nothing assigned to this editor yet." />}
          </div>
        </>
      )}
    </div>
  );
}
