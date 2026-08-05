"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { C, STATUS_GROUPS, STATUS_COLORS } from "@/lib/theme";
import { Card, Button, inputStyle } from "@/components/ui";
import { useSession } from "@/components/SessionProvider";
import type { CalendarEntry, Editor } from "@/lib/queries/calendar";

const STATUS_ORDER = [...STATUS_GROUPS["To-do"], ...STATUS_GROUPS["In progress"], ...STATUS_GROUPS["Complete"]];

export function BrandTab({
  label,
  active,
  onClick,
  icon: Icon,
  progress,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ElementType;
  progress?: { done: number; target: number; behind: boolean } | null;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
        padding: "6px 13px", borderRadius: 20, cursor: "pointer",
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentDim : "transparent",
        color: active ? C.accentLight : C.textMuted,
      }}
    >
      {Icon && <Icon size={12} />} {label}
      {progress && (
        <span className="cl-mono" style={{ fontSize: 10, color: progress.behind ? C.warning : C.textFaint, fontWeight: 700 }}>
          {progress.done}/{progress.target}
        </span>
      )}
    </button>
  );
}

export function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = STATUS_COLORS[value] || STATUS_COLORS.Unscripted;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cl-mono"
      style={{ background: c.bg, color: c.color, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
    >
      {Object.entries(STATUS_GROUPS).map(([group, statuses]) => (
        <optgroup key={group} label={group}>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function QuickAddRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  function commit() {
    if (title.trim()) onAdd(title.trim());
    setTitle("");
    setEditing(false);
  }
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.textFaint, fontSize: 12.5, cursor: "pointer", padding: "4px 2px" }}>
        <Plus size={13} /> New page
      </button>
    );
  }
  return (
    <input
      autoFocus
      style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, maxWidth: 320 }}
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setTitle("");
          setEditing(false);
        }
      }}
      onBlur={commit}
      placeholder="Untitled — press Enter"
    />
  );
}

export default function ScriptTable({
  entries,
  editors,
  onOpen,
  onUpdate,
  onDelete,
  onQuickAdd,
}: {
  entries: CalendarEntry[];
  editors: Editor[];
  onOpen: (entry: CalendarEntry) => void;
  onUpdate: (id: string, patch: Partial<CalendarEntry>) => void;
  onDelete: (entry: CalendarEntry) => void;
  onQuickAdd: (status: string, title: string) => void;
}) {
  const { profile } = useSession();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Unscripted: true });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const cellInput = { ...inputStyle, padding: "5px 8px", fontSize: 12.5, border: "1px solid transparent", background: "transparent" };

  function toggle(status: string) {
    setCollapsed((c) => ({ ...c, [status]: !c[status] }));
  }
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function bulkSetStatus(status: string) {
    selected.forEach((id) => onUpdate(id, { status }));
    setSelected(new Set());
  }
  function bulkSetEditor(editorProfileId: string | null) {
    selected.forEach((id) => onUpdate(id, { editorProfileId }));
    setSelected(new Set());
  }
  function bulkDelete() {
    const ids = new Set(selected);
    entries.filter((e) => ids.has(e.id)).forEach((e) => onDelete(e));
    setSelected(new Set());
  }

  const q = search.trim().toLowerCase();
  const editorName = (id: string | null) => (id === profile.id ? profile.name : editors.find((e) => e.id === id)?.name || "");
  const filteredEntries = q
    ? entries.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(q) ||
          editorName(e.editorProfileId).toLowerCase().includes(q) ||
          (e.date || "").includes(q) ||
          (e.brand || "").toLowerCase().includes(q)
      )
    : entries;
  const effectiveCollapsed = q ? {} : collapsed;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ position: "relative", marginBottom: 2 }}>
        <input
          style={{ ...inputStyle, paddingLeft: 34, maxWidth: 320 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, editor, or date..."
        />
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}>
          <FileText size={14} />
        </span>
      </div>

      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "8px 12px", flexWrap: "wrap" }}>
          <span className="cl-mono" style={{ fontSize: 11.5, color: C.accentLight, fontWeight: 700 }}>{selected.size} selected</span>
          <select style={{ ...inputStyle, width: 150, padding: "5px 8px", fontSize: 12 }} defaultValue="" onChange={(e) => { if (e.target.value) bulkSetStatus(e.target.value); }}>
            <option value="" disabled>Move to status...</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select style={{ ...inputStyle, width: 150, padding: "5px 8px", fontSize: 12 }} defaultValue="" onChange={(e) => { if (e.target.value) bulkSetEditor(e.target.value === "__unassign" ? null : e.target.value); }}>
            <option value="" disabled>Assign editor...</option>
            <option value="__unassign">Unassigned</option>
            <option value={profile.id}>{profile.name} (You)</option>
            {editors.filter((ed) => ed.id !== profile.id).map((ed) => (
              <option key={ed.id} value={ed.id}>{ed.name}</option>
            ))}
          </select>
          <Button size="sm" variant="danger" onClick={bulkDelete}><Trash2 size={12} /> Delete</Button>
          <button onClick={() => setSelected(new Set())} style={{ marginLeft: "auto", background: "none", border: "none", color: C.textFaint, fontSize: 11.5, cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const rows = filteredEntries.filter((e) => (e.status || "Unscripted") === status);
        const sc = STATUS_COLORS[status];
        const isCollapsed = effectiveCollapsed[status];
        if (q && rows.length === 0) return null;
        return (
          <div key={status}>
            <button onClick={() => toggle(status)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "6px 2px", width: "100%" }}>
              {isCollapsed ? <ChevronRight size={14} color={C.textFaint} /> : <ChevronDown size={14} color={C.textFaint} />}
              <span className="cl-mono" style={{ background: sc.bg, color: sc.color, fontSize: 11, padding: "3px 9px", borderRadius: 6, fontWeight: 700 }}>{status}</span>
              <span style={{ fontSize: 11.5, color: C.textFaint }}>{rows.length}</span>
            </button>

            {!isCollapsed && (
              <Card style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                        <th style={{ padding: "8px 6px", width: 28 }}></th>
                        {["Reel", "Form", "Filming date", "Editor", "Final vid", "Raw video", "Reference", ""].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", fontSize: 10, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, background: selected.has(c.id) ? C.accentDim : "transparent" }}>
                          <td style={{ padding: "9px 6px", textAlign: "center" }}>
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                          </td>
                          <td style={{ padding: "9px 12px", cursor: "pointer", maxWidth: 220 }} onClick={() => onOpen(c)} title="Open full script, notes & drive folder">
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                            <div style={{ fontSize: 10.5, color: C.textFaint }}>{c.brand}</div>
                          </td>
                          <td style={{ padding: "4px 8px" }}>
                            <input
                              style={{ ...cellInput, width: 90 }}
                              value={c.format || ""}
                              placeholder="Format"
                              onFocus={(e) => Object.assign(e.target.style, { border: `1px solid ${C.border}`, background: C.surface2 })}
                              onBlur={(e) => Object.assign(e.target.style, { border: "1px solid transparent", background: "transparent" })}
                              onChange={(e) => onUpdate(c.id, { format: e.target.value })}
                            />
                          </td>
                          <td style={{ padding: "4px 8px" }}>
                            <input type="date" style={{ ...cellInput, width: 140 }} value={c.date || ""} onChange={(e) => onUpdate(c.id, { date: e.target.value || null })} />
                          </td>
                          <td style={{ padding: "4px 8px" }}>
                            <select style={{ ...cellInput, width: 130 }} value={c.editorProfileId || ""} onChange={(e) => onUpdate(c.id, { editorProfileId: e.target.value || null })}>
                              <option value="">Unassigned</option>
                              <option value={profile.id}>{profile.name} (You)</option>
                              {editors.filter((ed) => ed.id !== profile.id).map((ed) => (
                                <option key={ed.id} value={ed.id}>{ed.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "4px 8px" }}>
                            <input
                              style={{ ...cellInput, width: 140, color: c.finalVideoLink ? C.accentLight : C.text }}
                              value={c.finalVideoLink || ""}
                              placeholder="Empty"
                              onFocus={(e) => Object.assign(e.target.style, { border: `1px solid ${C.border}`, background: C.surface2 })}
                              onBlur={(e) => Object.assign(e.target.style, { border: "1px solid transparent", background: "transparent" })}
                              onChange={(e) => onUpdate(c.id, { finalVideoLink: e.target.value })}
                            />
                          </td>
                          <td style={{ padding: "4px 8px" }}>
                            <input
                              style={{ ...cellInput, width: 140, color: c.rawVideoLink ? C.accentLight : C.text }}
                              value={c.rawVideoLink || ""}
                              placeholder="Empty"
                              onFocus={(e) => Object.assign(e.target.style, { border: `1px solid ${C.border}`, background: C.surface2 })}
                              onBlur={(e) => Object.assign(e.target.style, { border: "1px solid transparent", background: "transparent" })}
                              onChange={(e) => onUpdate(c.id, { rawVideoLink: e.target.value })}
                            />
                          </td>
                          <td style={{ padding: "4px 8px" }}>
                            <input
                              style={{ ...cellInput, width: 140, color: c.referenceLink ? C.accentLight : C.text }}
                              value={c.referenceLink || ""}
                              placeholder="Empty"
                              onFocus={(e) => Object.assign(e.target.style, { border: `1px solid ${C.border}`, background: C.surface2 })}
                              onBlur={(e) => Object.assign(e.target.style, { border: "1px solid transparent", background: "transparent" })}
                              onChange={(e) => onUpdate(c.id, { referenceLink: e.target.value })}
                            />
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <button onClick={() => onDelete(c)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={9} style={{ padding: "6px 12px" }}>
                          <QuickAddRow onAdd={(title) => onQuickAdd(status, title)} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: C.textFaint, padding: "2px 4px" }}>
        Click a reel's title to open its full script, notes, and Drive folder — everything else here edits directly in the table.
      </div>
    </div>
  );
}

export { STATUS_ORDER };
