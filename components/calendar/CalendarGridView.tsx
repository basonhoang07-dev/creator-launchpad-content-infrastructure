"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Film, Sparkles } from "lucide-react";
import { C, STATUS_COLORS, WEEKDAY_NAMES } from "@/lib/theme";
import { Button, Modal } from "@/components/ui";
import { todayPlus, parseDateOnly, formatDateOnly } from "@/lib/helpers";
import { STATUS_ORDER } from "@/components/calendar/ScriptTable";
import type { CalendarEntry } from "@/lib/queries/calendar";

function DayShotListModal({ date, entries, onOpen, onClose }: { date: string; entries: CalendarEntry[]; onOpen: (e: CalendarEntry) => void; onClose: () => void }) {
  const sorted = [...entries].sort((a, b) => STATUS_ORDER.indexOf(a.status || "Unscripted") - STATUS_ORDER.indexOf(b.status || "Unscripted"));
  return (
    <Modal title={parseDateOnly(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} onClose={onClose} width={520}>
      <div className="cl-mono" style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>
        {entries.length} piece{entries.length !== 1 ? "s" : ""} to film this day
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {sorted.map((c) => {
          const sc = STATUS_COLORS[c.status || "Unscripted"];
          return (
            <button
              key={c.id}
              onClick={() => onOpen(c)}
              style={{ display: "flex", alignItems: "center", gap: 12, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 7, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Film size={14} color={C.accentLight} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: C.textMuted }}>{c.brand}</div>
              </div>
              <span className="cl-mono" style={{ background: sc.bg, color: sc.color, fontSize: 10, padding: "3px 8px", borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>{c.status || "Unscripted"}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export default function CalendarGridView({
  entries,
  dailyVolume,
  onAutoSchedule,
  onOpen,
  onReschedule,
}: {
  entries: CalendarEntry[];
  dailyVolume: number;
  onAutoSchedule: () => void;
  onOpen: (e: CalendarEntry) => void;
  onReschedule: (id: string, date: string) => void;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [showNoDate, setShowNoDate] = useState(true);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const unscheduled = entries.filter((c) => !c.date);
  const scheduled = entries.filter((c) => c.date);
  const byDate: Record<string, CalendarEntry[]> = {};
  scheduled.forEach((c) => {
    byDate[c.date!] = byDate[c.date!] || [];
    byDate[c.date!].push(c);
  });

  const monthAnchor = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  })();
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startOffset);
  const gridDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  function handleDrop(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    setDragOverDate(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) onReschedule(id, dateStr);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setShowNoDate((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}>
          {showNoDate ? <ChevronDown size={13} color={C.textFaint} /> : <ChevronRight size={13} color={C.textFaint} />}
          <Clock size={12} color={C.textFaint} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>No date ({unscheduled.length})</span>
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setMonthOffset((w) => w - 1)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, color: C.textMuted, cursor: "pointer" }}><ChevronLeft size={15} /></button>
          <Button size="sm" variant="secondary" onClick={() => setMonthOffset(0)}>Today</Button>
          <button onClick={() => setMonthOffset((w) => w + 1)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, color: C.textMuted, cursor: "pointer" }}><ChevronRight size={15} /></button>
          <span className="cl-display" style={{ fontSize: 15, fontWeight: 700, marginLeft: 6, minWidth: 140 }}>{monthLabel}</span>
        </div>
      </div>

      {showNoDate && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, padding: "10px 12px", background: C.surface2, border: `1px dashed ${C.borderLight}`, borderRadius: 10 }}>
          {unscheduled.map((c) => {
            const sc = STATUS_COLORS[c.status || "Unscripted"];
            return (
              <button
                key={c.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                onClick={() => onOpen(c)}
                className="cl-mono"
                style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface3, border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 11.5, color: C.text, cursor: "grab" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.color, flexShrink: 0 }} />
                {c.title}
              </button>
            );
          })}
          {unscheduled.length === 0 && <span style={{ fontSize: 12, color: C.textFaint }}>Nothing unscheduled.</span>}
          {unscheduled.length > 0 && <span style={{ fontSize: 10.5, color: C.textFaint, alignSelf: "center", marginLeft: 4 }}>Drag any of these onto a day →</span>}
        </div>
      )}

      <div className="cl-hscroll-mobile">
        <div className="cl-calendar-week-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: C.border, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, minWidth: 560 }}>
          {WEEKDAY_NAMES.map((wd) => (
            <div key={wd} className="cl-mono" style={{ background: C.surface2, fontSize: 10, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", padding: "6px 8px", textAlign: "center" }}>{wd.slice(0, 3)}</div>
          ))}
          {gridDays.map((d, i) => {
            const dateStr = formatDateOnly(d);
            const inMonth = d.getMonth() === monthAnchor.getMonth();
            const isToday = dateStr === todayPlus(0);
            const dayEntries = byDate[dateStr] || [];
            const count = dayEntries.length;
            const HARD_CAP = 14;
            const visible = dayEntries.slice(0, HARD_CAP);
            const pill =
              count <= 4
                ? { fontSize: 9.5, padding: "3px 6px", gap: 3 }
                : count <= 7
                ? { fontSize: 8.2, padding: "2px 5px", gap: 2 }
                : count <= 10
                ? { fontSize: 7.2, padding: "1.5px 4px", gap: 1.5 }
                : { fontSize: 6.4, padding: "1px 3px", gap: 1 };
            const isDragOver = dragOverDate === dateStr;
            return (
              <div
                key={i}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverDate !== dateStr) setDragOverDate(dateStr);
                }}
                onDragLeave={() => setDragOverDate((d2) => (d2 === dateStr ? null : d2))}
                onDrop={(e) => handleDrop(e, dateStr)}
                style={{ background: isDragOver ? C.accentDim : C.surface, height: 96, padding: 6, opacity: inMonth ? 1 : 0.35, display: "flex", flexDirection: "column", gap: pill.gap, overflow: "hidden", boxShadow: isDragOver ? `inset 0 0 0 2px ${C.accent}` : "none" }}
              >
                <span
                  className="cl-mono"
                  onClick={() => count > 0 && setDayModalDate(dateStr)}
                  style={{ fontSize: 10.5, fontWeight: 700, color: isToday ? C.accentLight : C.textFaint, flexShrink: 0, cursor: count > 0 ? "pointer" : "default" }}
                >
                  {isToday ? <span style={{ background: C.accent, color: "#fff", borderRadius: 4, padding: "1px 5px" }}>{d.getDate()}</span> : d.getDate()}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: pill.gap, overflow: "hidden", flex: 1 }}>
                  {visible.map((c) => {
                    const sc = STATUS_COLORS[c.status || "Unscripted"];
                    return (
                      <button
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                        onClick={() => onOpen(c)}
                        className="cl-mono"
                        style={{ textAlign: "left", background: sc.bg, color: sc.color, border: "none", borderRadius: 4, padding: pill.padding, fontSize: pill.fontSize, fontWeight: 700, cursor: "grab", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0, lineHeight: 1.3 }}
                      >
                        {c.title}
                      </button>
                    );
                  })}
                  {count > HARD_CAP && (
                    <button onClick={() => setDayModalDate(dateStr)} style={{ fontSize: 8, color: C.textFaint, paddingLeft: 4, flexShrink: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                      +{count - HARD_CAP} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: C.textFaint }}>
          Daily filming volume for this board: <b className="cl-mono">{dailyVolume}</b>/day, from its KPI campaign. Drag any pill to a new day, or click a date with content to see the full shot list.
        </div>
        <Button size="sm" onClick={onAutoSchedule}><Sparkles size={13} /> Auto-schedule batch</Button>
      </div>

      {dayModalDate && (
        <DayShotListModal
          date={dayModalDate}
          entries={byDate[dayModalDate] || []}
          onOpen={(c) => {
            setDayModalDate(null);
            onOpen(c);
          }}
          onClose={() => setDayModalDate(null)}
        />
      )}
    </div>
  );
}
