"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Repeat, Trash2, CalendarClock } from "lucide-react";
import { C, BLOCK_TYPES, BLOCK_COLORS, WEEKDAY_NAMES } from "@/lib/theme";
import { Button, Field, Modal, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { getWeekKey, todayPlus, occurrencesOn, repeatLabel, parseDateOnly, formatDateOnly, type AvailabilityBlock } from "@/lib/helpers";
import { saveBlock as saveBlockRow, deleteBlock as deleteBlockRow } from "@/lib/queries/calendar";
import { useToast, toastMessage } from "@/components/Toast";

interface GoogleEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  allDay: boolean;
}

// Best-effort — Calendar sync is a side effect of saving/deleting a block,
// never something that should block or fail the block save itself.
async function syncAvailabilityToGoogle(clientId: string, action: "sync" | "delete", extra: { blockId?: string; googleEventId?: string | null }) {
  try {
    await fetch("/api/google-calendar/sync-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        action,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...extra,
      }),
    });
  } catch {
    // Silent — their availability is already saved in the app either way.
  }
}

function BlockModal({
  initialDate,
  editingBlock,
  onSave,
  onDelete,
  onClose,
}: {
  initialDate: string | null;
  editingBlock: AvailabilityBlock | null;
  onSave: (block: { id?: string; label: string; date: string; allDay: boolean; startTime: string; endTime: string; freq: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(editingBlock?.label || "Filming");
  const [date, setDate] = useState(editingBlock?.block_date || initialDate || todayPlus(0));
  const [allDay, setAllDay] = useState(editingBlock ? editingBlock.all_day : false);
  const [startTime, setStartTime] = useState(editingBlock?.start_time || "09:00");
  const [endTime, setEndTime] = useState(editingBlock?.end_time || "17:00");
  const [freq, setFreq] = useState(editingBlock?.repeat_freq || "none");

  function save() {
    onSave({ id: editingBlock?.id, label, date, allDay, startTime: allDay ? "" : startTime, endTime: allDay ? "" : endTime, freq });
  }

  return (
    <Modal title={editingBlock ? "Edit availability block" : "Add availability"} onClose={onClose} width={440}>
      <Field label="Type">
        <select style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)}>
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textMuted, marginBottom: 14 }}>
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      {!allDay && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Start time">
            <input type="time" style={inputStyle} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="End time">
            <input type="time" style={inputStyle} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
      )}
      <Field label={<span style={{ display: "flex", alignItems: "center", gap: 6 }}><Repeat size={12} /> Repeat</span>}>
        <select style={inputStyle} value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">{repeatLabel("weekly", date)}</option>
          <option value="weekday">Every weekday (Mon–Fri)</option>
        </select>
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Button style={{ flex: 1, justifyContent: "center" }} onClick={save}>Save</Button>
        {editingBlock && (
          <Button variant="danger" onClick={() => onDelete(editingBlock.id)}>
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </Modal>
  );
}

export default function AvailabilityEditor({
  clientId,
  blocks,
  onChange,
}: {
  clientId: string;
  blocks: AvailabilityBlock[];
  onChange: (blocks: AvailabilityBlock[]) => void;
}) {
  const { showToast } = useToast();
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<AvailabilityBlock | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);

  const week1Start = (() => {
    const d = parseDateOnly(getWeekKey());
    d.setDate(d.getDate() + weekOffset * 14);
    return formatDateOnly(d);
  })();
  const gridDays = Array.from({ length: 14 }, (_, i) => {
    const d = parseDateOnly(week1Start);
    d.setDate(d.getDate() + i);
    return formatDateOnly(d);
  });

  // Read-only pull of the client's real Google Calendar for whichever
  // 14-day window is currently in view — a no-op (empty list) if they've
  // never connected Calendar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/google-calendar/events?clientId=${encodeURIComponent(clientId)}&start=${gridDays[0]}&end=${gridDays[13]}`);
        const json = await res.json();
        if (!cancelled && res.ok) setGoogleEvents(json.events || []);
      } catch {
        // Silent — this is a supplementary read, not core functionality.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, week1Start]);

  async function handleSave(block: { id?: string; label: string; date: string; allDay: boolean; startTime: string; endTime: string; freq: string }) {
    try {
      const supabase = createClient();
      const saved = await saveBlockRow(supabase, clientId, block);
      const exists = blocks.some((b) => b.id === saved.id);
      onChange(exists ? blocks.map((b) => (b.id === saved.id ? saved : b)) : [...blocks, saved]);
      setModalDate(null);
      setEditingBlock(null);
      syncAvailabilityToGoogle(clientId, "sync", { blockId: saved.id });
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that availability block — try again."));
    }
  }
  async function handleDelete(id: string) {
    try {
      const googleEventId = blocks.find((b) => b.id === id)?.google_event_id;
      const supabase = createClient();
      await deleteBlockRow(supabase, id);
      onChange(blocks.filter((b) => b.id !== id));
      setModalDate(null);
      setEditingBlock(null);
      syncAvailabilityToGoogle(clientId, "delete", { googleEventId });
    } catch (err) {
      showToast(toastMessage(err, "Couldn't delete that block — try again."));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12.5, color: C.textFaint, lineHeight: 1.6, maxWidth: 560 }}>
          Add a block for unavailable time or a daily focus — set it to repeat daily, weekly, or every weekday just like Google Calendar. Auto-schedule only
          places content on days with a <b style={{ color: C.text }}>Filming</b> block, and skips anything marked fully unavailable.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setWeekOffset((w) => w - 1)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, color: C.textMuted, cursor: "pointer" }}>
            <ChevronLeft size={15} />
          </button>
          <Button size="sm" variant="secondary" onClick={() => setWeekOffset(0)}>Today</Button>
          <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, color: C.textMuted, cursor: "pointer" }}>
            <ChevronRight size={15} />
          </button>
          <Button size="sm" onClick={() => setModalDate(gridDays[0])}>
            <Plus size={13} /> Add availability
          </Button>
        </div>
      </div>

      <div className="cl-hscroll-mobile">
        <div style={{ minWidth: 640 }}>
          <div className="cl-calendar-week-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
            {WEEKDAY_NAMES.slice(1).concat(WEEKDAY_NAMES[0]).map((wd) => (
              <div key={wd} className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint, textAlign: "center", fontWeight: 700, textTransform: "uppercase" }}>
                {wd.slice(0, 3)}
              </div>
            ))}
          </div>

          {[gridDays.slice(0, 7), gridDays.slice(7, 14)].map((week, wi) => (
            <div key={wi} className="cl-calendar-week-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
              {week.map((d) => {
                const occ = occurrencesOn(blocks, d);
                const dayEvents = googleEvents.filter((e) => e.date === d);
                const isToday = d === todayPlus(0);
                return (
                  <div key={d} style={{ background: C.surface, border: `1px solid ${isToday ? C.accent : C.border}`, borderRadius: 10, padding: 8, minHeight: 96, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="cl-mono" style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.accentLight : C.textMuted }}>
                        {new Date(d).getDate()}
                      </span>
                      <button onClick={() => setModalDate(d)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: 2 }}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {occ.map((b) => {
                        const bc = BLOCK_COLORS[b.label];
                        return (
                          <button
                            key={b.id}
                            onClick={() => setEditingBlock(b)}
                            className="cl-mono"
                            style={{ textAlign: "left", background: bc.bg, color: bc.color, border: "none", borderRadius: 5, padding: "3px 6px", fontSize: 9.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                          >
                            {b.repeat_freq !== "none" && <Repeat size={9} />}
                            {b.all_day ? b.label : `${b.start_time} ${b.label}`}
                          </button>
                        );
                      })}
                      {dayEvents.map((e) => (
                        <div
                          key={e.id}
                          title={e.title}
                          className="cl-mono"
                          style={{ textAlign: "left", background: C.surface2, color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 5, padding: "3px 6px", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          <CalendarClock size={9} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.allDay ? e.title : `${e.time} ${e.title}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {(modalDate || editingBlock) && (
        <BlockModal
          initialDate={modalDate}
          editingBlock={editingBlock}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => {
            setModalDate(null);
            setEditingBlock(null);
          }}
        />
      )}
    </div>
  );
}
