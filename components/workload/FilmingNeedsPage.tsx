"use client";

import React from "react";
import { CalendarDays, ChevronRight, Film } from "lucide-react";
import { C, STATUS_COLORS } from "@/lib/theme";
import { Card, Button, Badge, SectionHeader, EmptyState } from "@/components/ui";
import { isSameMonth, todayPlus } from "@/lib/helpers";
import type { WorkloadData } from "@/lib/queries/workload";
import type { CalendarEntry } from "@/lib/queries/calendar";

export default function FilmingNeedsPage({
  data,
  hideHeader,
  onNavigateToBrand,
}: {
  data: WorkloadData;
  hideHeader?: boolean;
  onNavigateToBrand?: (brand: string, view: string) => void;
}) {
  const monthLogs = data.weeklyLogs.filter((l) => isSameMonth(l.weekOf));
  const dayOfMonth = new Date().getDate();

  const boards = data.brands.map((brand) => {
    const campaign = data.campaigns.find((c) => c.brand === brand);
    const dailyVolume = campaign ? Number(campaign.maxPosts) || 0 : 0;
    const monthlyTarget = dailyVolume * 30;
    const filmedThisMonth = monthLogs.reduce((sum, l) => {
      const entry = l.campaignEntries.find((e) => e.campaignBrand === brand);
      return sum + (entry ? entry.videosFilmed || 0 : 0);
    }, 0);
    const upcoming = data.entries.filter((c) => c.brand === brand && c.date && c.date >= todayPlus(0)).length;
    const expectedByNow = monthlyTarget * (dayOfMonth / 30);
    const behind = monthlyTarget > 0 && filmedThisMonth < expectedByNow;
    return { brand, dailyVolume, monthlyTarget, filmedThisMonth, upcoming, behind };
  });

  const upcomingEntries = data.entries.filter((c) => c.date && c.date >= todayPlus(0)).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const byDate: Record<string, CalendarEntry[]> = {};
  upcomingEntries.forEach((c) => {
    byDate[c.date!] = byDate[c.date!] || [];
    byDate[c.date!].push(c);
  });
  const dateKeys = Object.keys(byDate).sort().slice(0, 10);

  return (
    <div>
      {!hideHeader && <SectionHeader eyebrow="What's due, and when" title="Filming Needs" />}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textMuted, marginBottom: 10 }}>UPCOMING FILMING DAYS</div>
      <div style={{ display: "grid", gap: 14, marginBottom: 28 }}>
        {dateKeys.map((date) => (
          <div key={date}>
            <div className="cl-mono" style={{ fontSize: 11.5, color: C.accentLight, marginBottom: 6, fontWeight: 700 }}>
              {new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {byDate[date].map((c) => {
                const sc = STATUS_COLORS[c.status || "Unscripted"];
                return (
                  <button
                    key={c.id}
                    onClick={() => onNavigateToBrand && onNavigateToBrand(c.brand, "calendar")}
                    style={{ display: "flex", alignItems: "center", gap: 12, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", textAlign: "left", width: "100%" }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Film size={14} color={C.accentLight} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{c.brand} · {c.format}</div>
                    </div>
                    <span className="cl-mono" style={{ background: sc.bg, color: sc.color, fontSize: 10, padding: "3px 8px", borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>{c.status || "Unscripted"}</span>
                    <ChevronRight size={14} color={C.textFaint} style={{ flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {dateKeys.length === 0 && <EmptyState icon={CalendarDays} text="Nothing scheduled to film yet." />}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textMuted, marginBottom: 10 }}>PACE BY BRAND — THIS MONTH</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {boards.map((b) => (
          <Card key={b.brand}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{b.brand}</div>
              {b.monthlyTarget > 0 ? <Badge tone={b.behind ? "warning" : "success"}>{b.behind ? "Behind" : "On track"}</Badge> : <Badge>No KPI set</Badge>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: C.textMuted }}>Filmed this month</span>
              <span className="cl-mono" style={{ fontWeight: 700 }}>{b.filmedThisMonth} / {b.monthlyTarget}</span>
            </div>
            <div style={{ width: "100%", height: 6, background: C.surface3, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ width: `${b.monthlyTarget > 0 ? Math.min(100, (b.filmedThisMonth / b.monthlyTarget) * 100) : 0}%`, height: "100%", background: b.behind ? C.warning : C.success, borderRadius: 4 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.textFaint, marginBottom: b.dailyVolume ? 14 : 0 }}>
              <span>{b.dailyVolume}/day needed</span>
              <span>{b.upcoming} scheduled ahead</span>
            </div>
            {onNavigateToBrand && (
              <Button size="sm" variant="secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => onNavigateToBrand(b.brand, "table")}>
                <Film size={13} /> View filming schedule
              </Button>
            )}
          </Card>
        ))}
        {boards.length === 0 && <EmptyState icon={Film} text="No brand boards yet." />}
      </div>
    </div>
  );
}
