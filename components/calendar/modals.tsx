"use client";

import React, { useState } from "react";
import { CalendarCheck, Check, ChevronRight, Film, Lock, Wand2 } from "lucide-react";
import { C } from "@/lib/theme";
import { Button, Card, Field, Modal, SectionHeader, Badge, inputStyle } from "@/components/ui";

export interface ScheduleSummaryEntry {
  id: string;
  title: string;
  format: string;
  date: string;
  invented: boolean;
}
export interface ScheduleSummary {
  source: "auto" | "claude";
  rationale: string;
  entries: ScheduleSummaryEntry[];
}

export function SchedulePreviewModal({ summary, onOpenEntry, onClose }: { summary: ScheduleSummary; onOpenEntry: (id: string) => void; onClose: () => void }) {
  const byDate: Record<string, ScheduleSummaryEntry[]> = {};
  summary.entries.forEach((c) => {
    byDate[c.date] = byDate[c.date] || [];
    byDate[c.date].push(c);
  });
  const dateKeys = Object.keys(byDate).sort();
  const inventedCount = summary.entries.filter((c) => c.invented).length;

  return (
    <Modal title={summary.source === "claude" ? "Claude's plan — what changed" : "Auto-schedule — what changed"} onClose={onClose} width={560}>
      <div className="cl-mono" style={{ fontSize: 11.5, color: C.accentLight, marginBottom: 12 }}>
        {summary.entries.length} piece{summary.entries.length !== 1 ? "s" : ""} placed across {dateKeys.length} day{dateKeys.length !== 1 ? "s" : ""}
        {inventedCount > 0 ? ` · ${inventedCount} new concept${inventedCount !== 1 ? "s" : ""} invented` : ""}
      </div>

      {summary.rationale && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.text }}>
          <Wand2 size={15} color={C.accentLight} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1 }}><b style={{ color: C.accentLight }}>Reasoning:</b> {summary.rationale}</span>
        </div>
      )}

      <div style={{ display: "grid", gap: 14, maxHeight: 380, overflowY: "auto" }} className="cl-scroll">
        {dateKeys.map((date) => (
          <div key={date}>
            <div className="cl-mono" style={{ fontSize: 11.5, color: C.accentLight, marginBottom: 6, fontWeight: 700 }}>
              {new Date(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {byDate[date].map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenEntry(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  <Film size={14} color={C.accentLight} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{c.title}</span>
                  <span style={{ fontSize: 11, color: C.textFaint }}>{c.format}</span>
                  {c.invented && <Badge tone="accent">New</Badge>}
                  <ChevronRight size={14} color={C.textFaint} style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={onClose}>
        <Check size={14} /> Looks good
      </Button>
    </Modal>
  );
}

export function CapacitySetupModal({ brand, initialValue, onSave, onClose }: { brand: string; initialValue: number | null; onSave: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  const isEditing = !!initialValue;
  return (
    <Modal title={isEditing ? "Edit filming capacity" : "Quick setup — filming capacity"} onClose={onClose} width={420}>
      <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 16, lineHeight: 1.5 }}>
        {isEditing ? "Update" : "Before scheduling for"} <b style={{ color: C.text }}>{brand}</b>{isEditing ? "'s" : ":"} how many videos can you realistically film in one session? This caps how many get booked per
        day — even if your KPI math would want more, the schedule stays honest about what's actually achievable.
      </div>
      <Field label="Videos per filming session">
        <input type="number" style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 4" autoFocus />
      </Field>
      {!isEditing && (
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, marginTop: -6 }}>
          You can change this anytime — a "Filming capacity" button sits right next to your board tabs.
        </div>
      )}
      <Button style={{ width: "100%", justifyContent: "center" }} onClick={() => onSave(value)} disabled={!value || Number(value) <= 0}>
        <Check size={14} /> {isEditing ? "Save" : "Save & continue"}
      </Button>
    </Modal>
  );
}

export interface NewBoardPayload {
  name: string;
  rate: number;
  minPosts: number;
  maxPosts: number;
  sessionCapacity: number;
  concept: { title: string; format: string } | null;
}

export function NewBoardWizard({ existingBrands, onCreate, onClose }: { existingBrands: string[]; onCreate: (payload: NewBoardPayload) => void; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [minPosts, setMinPosts] = useState("");
  const [maxPosts, setMaxPosts] = useState("");
  const [sessionCapacity, setSessionCapacity] = useState("");
  const [conceptTitle, setConceptTitle] = useState("");
  const [conceptFormat, setConceptFormat] = useState("Talking head");

  const nameValid = !!name.trim() && !existingBrands.includes(name.trim());
  const STEPS = ["Brand", "KPI goal", "First concept"];

  function finish(skipConcept: boolean) {
    const brandName = name.trim();
    onCreate({
      name: brandName,
      rate: Number(rate) || 0,
      minPosts: Number(minPosts) || 0,
      maxPosts: Number(maxPosts) || 0,
      sessionCapacity: Number(sessionCapacity) || 0,
      concept: !skipConcept && conceptTitle.trim() ? { title: conceptTitle.trim(), format: conceptFormat } : null,
    });
  }

  return (
    <Modal title="New brand board" onClose={onClose} width={460}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ height: 3, borderRadius: 2, background: i + 1 <= step ? C.accent : C.surface3, marginBottom: 6 }} />
            <span style={{ fontSize: 10, color: i + 1 === step ? C.accentLight : C.textFaint, fontWeight: 600 }}>{s}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <>
          <Field label="Brand name">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vela Haircare" autoFocus />
          </Field>
          {name.trim() && !nameValid && <div style={{ fontSize: 11.5, color: C.danger, marginBottom: 14 }}>A board with this name already exists.</div>}
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Creates a separate script board so scripts never get mixed up between brands.</div>
          <Button style={{ width: "100%", justifyContent: "center" }} onClick={() => setStep(2)} disabled={!nameValid}>Continue</Button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Set the retainer terms for {name} — this drives daily filming/scripting volume everywhere in the app. You can skip and fill this in later from KPI Trackers.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <Field label="Rate/video ($)"><input type="number" style={inputStyle} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="25" /></Field>
            <Field label="Min/day"><input type="number" style={inputStyle} value={minPosts} onChange={(e) => setMinPosts(e.target.value)} placeholder="1" /></Field>
            <Field label="Max/day"><input type="number" style={inputStyle} value={maxPosts} onChange={(e) => setMaxPosts(e.target.value)} placeholder="2" /></Field>
          </div>
          <Field label="Videos per filming session (realistic, not aspirational)">
            <input type="number" style={inputStyle} value={sessionCapacity} onChange={(e) => setSessionCapacity(e.target.value)} placeholder="e.g. 4" />
          </Field>
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, marginTop: -6 }}>
            This is what actually caps a filming day — if it's below what your KPI needs, the scheduler will flag the gap instead of quietly overbooking you.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button style={{ flex: 1, justifyContent: "center" }} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Optional — prime the board with your first concept so there's something in the unscheduled bucket right away.</div>
          <Field label="Concept title">
            <input style={inputStyle} value={conceptTitle} onChange={(e) => setConceptTitle(e.target.value)} placeholder="e.g. Unboxing + first impressions" />
          </Field>
          <Field label="Format">
            <input style={inputStyle} value={conceptFormat} onChange={(e) => setConceptFormat(e.target.value)} placeholder="Talking head, demo, unboxing..." />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
            <Button variant="secondary" onClick={() => finish(true)}>Skip & create</Button>
            <Button style={{ flex: 1, justifyContent: "center" }} onClick={() => finish(false)} disabled={!conceptTitle.trim()}>
              <Check size={14} /> Create board
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ConnectCalendarGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div>
      <SectionHeader eyebrow="One step first" title="Content Calendar" />
      <Card style={{ textAlign: "center", padding: "52px 32px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Lock size={24} color={C.accentLight} />
        </div>
        <h3 className="cl-display" style={{ fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>Connect Google Calendar to continue</h3>
        <p style={{ fontSize: 13.5, color: C.textMuted, maxWidth: 440, margin: "0 auto 22px", lineHeight: 1.6 }}>
          This syncs your availability so content only ever gets scheduled on days you're actually free to film. Once connected, set your unavailable time, available time, and daily focus in the Availability tab.
        </p>
        <Button onClick={onConnect}><CalendarCheck size={15} /> Connect Google Calendar</Button>
      </Card>
    </div>
  );
}
