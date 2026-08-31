"use client";

// components/admin/LeadsPanel.tsx
//
// The lead tracker, and the deeplinks that feed it.
//
// Laid out as a call sheet rather than a CRM: the columns are the ones you
// need in the two seconds before the phone connects — who they are, where
// they came from, how warm they looked, and what you wrote last time. Stage,
// quality, dialed and notes all edit in place, because anything that needs
// a modal doesn't get updated mid-call.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Check, Copy, Link2, Loader2, Phone, Plus, Search, Trash2, Users,
} from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, EmptyState, Field, Modal, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import {
  fetchLeads, fetchLeadSources, createLeadSource, archiveLeadSource, updateLead, removeLead,
  slugify, LEAD_STAGES, LEAD_QUALITIES,
  type Lead, type LeadSource, type LeadStage, type LeadQuality,
} from "@/lib/queries/leads";
import { useToast, toastMessage } from "@/components/Toast";

const ALL = "__all__";
const FUNNEL_BASE = "https://creatorlaunchpad.netlify.app";

const STAGE_TONE: Record<LeadStage, "default" | "accent" | "success" | "warning"> = {
  New: "accent",
  Dialed: "warning",
  Qualified: "success",
  Booked: "success",
  "No Close": "default",
  Junk: "default",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function LeadsPanel() {
  const { profile } = useSession();
  const { showToast } = useToast();

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [showSources, setShowSources] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [l, s] = await Promise.all([fetchLeads(supabase), fetchLeadSources(supabase)]);
    setLeads(l);
    setSources(s);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    (leads || []).forEach((l) => {
      if (l.sourceSlug) m.set(l.sourceSlug, (m.get(l.sourceSlug) || 0) + 1);
    });
    return m;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (leads || []).filter((l) => {
      if (stage !== ALL && l.stage !== stage) return false;
      if (source !== ALL && l.sourceSlug !== source) return false;
      if (!q) return true;
      return [l.fullName, l.firstName, l.email, l.phone, l.instagramHandle, l.notes, l.sourceSlug]
        .some((f) => (f || "").toLowerCase().includes(q));
    });
  }, [leads, search, stage, source]);

  // Edits are written straight through and the row is patched locally rather
  // than refetching — a dropdown that reorders the table under your cursor
  // mid-call is how you ring the wrong person.
  async function patch(id: string, p: Parameters<typeof updateLead>[2]) {
    setLeads((prev) => (prev || []).map((l) => (l.id === id ? { ...l, ...p } as Lead : l)));
    try {
      await updateLead(createClient(), id, p);
    } catch (err) {
      setError(toastMessage(err, "Couldn't save that — try again."));
      reload();
    }
  }

  async function drop(lead: Lead) {
    if (!confirm(`Remove ${lead.fullName || lead.firstName} (${lead.email}) from the tracker?`)) return;
    try {
      await removeLead(createClient(), lead.id);
      setLeads((prev) => (prev || []).filter((l) => l.id !== lead.id));
    } catch (err) {
      showToast(toastMessage(err, "Couldn't remove that lead."));
    }
  }

  if (!leads) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  const selectStyle = { ...inputStyle, width: "auto", minWidth: 130, padding: "6px 9px", fontSize: 12 };
  const cell: React.CSSProperties = { padding: "10px 10px", verticalAlign: "top", borderBottom: `1px solid ${C.border}` };
  const head: React.CSSProperties = {
    padding: "0 10px 8px", textAlign: "left", fontSize: 10.5, fontWeight: 700,
    color: C.textFaint, letterSpacing: "0.05em", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <Users size={15} color={C.accentLight} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Leads</div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => setShowSources(true)}>
              <Link2 size={13} /> Deeplinks ({sources.length})
            </Button>
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
          Everyone who finished the funnel, and which link they came through. Tick them off as you dial and leave
          yourself a note for the call.
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            style={{ ...inputStyle, paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, handle or notes..."
          />
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}>
            <Search size={14} />
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={selectStyle} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value={ALL}>All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select style={selectStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value={ALL}>All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.slug}>{s.label}</option>
            ))}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.textFaint }}>
            {filtered.length} of {leads.length}
          </span>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.danger, marginTop: 12 }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          text={
            leads.length === 0
              ? "No leads yet. Make a deeplink, put it in a bio or a post, and they'll land here."
              : "No leads match those filters."
          }
        />
      ) : (
        <Card style={{ padding: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
            <thead>
              <tr>
                <th style={head}>DIALED</th>
                <th style={head}>WHO</th>
                <th style={head}>PHONE</th>
                <th style={head}>CREATED</th>
                <th style={head}>STAGE</th>
                <th style={head}>SOURCE</th>
                <th style={head}>QUALITY</th>
                <th style={head}>GOAL / LEVEL</th>
                <th style={{ ...head, minWidth: 220 }}>PRE-CALL NOTE</th>
                <th style={head} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...cell, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={l.dialed}
                      onChange={(e) => patch(l.id, { dialed: e.target.checked })}
                      title={l.dialedAt ? `Dialed ${when(l.dialedAt)}` : "Not dialed yet"}
                      style={{ width: 15, height: 15, accentColor: C.accent, cursor: "pointer" }}
                    />
                  </td>

                  <td style={cell}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.fullName || l.firstName}</div>
                    <div style={{ fontSize: 11, color: C.textFaint }}>{l.email}</div>
                    {l.instagramHandle && (
                      <a
                        href={`https://instagram.com/${l.instagramHandle.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: C.accentLight, textDecoration: "none" }}
                      >
                        {l.instagramHandle.startsWith("@") ? l.instagramHandle : `@${l.instagramHandle}`}
                      </a>
                    )}
                  </td>

                  <td style={cell}>
                    {l.phone ? (
                      // tel: so it dials from a desktop softphone or hands
                      // off to a paired handset — the whole point of the
                      // column is the call.
                      <a href={`tel:${l.phone}`} style={{ fontSize: 12.5, color: C.text, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                        <Phone size={11} color={C.accentLight} /> {l.phone}
                      </a>
                    ) : (
                      <span style={{ fontSize: 11.5, color: C.textFaint }}>—</span>
                    )}
                  </td>

                  <td style={{ ...cell, fontSize: 11.5, color: C.textMuted, whiteSpace: "nowrap" }}>{when(l.createdAt)}</td>

                  <td style={cell}>
                    <select
                      value={l.stage}
                      onChange={(e) => patch(l.id, { stage: e.target.value as LeadStage })}
                      style={{ ...inputStyle, padding: "5px 7px", fontSize: 11.5, width: "auto", minWidth: 104 }}
                    >
                      {LEAD_STAGES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>

                  <td style={cell}>
                    {l.sourceSlug ? (
                      <Badge tone="accent">{sources.find((s) => s.slug === l.sourceSlug)?.label || l.sourceSlug}</Badge>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textFaint }}>Direct</span>
                    )}
                  </td>

                  <td style={cell}>
                    <select
                      value={l.quality || ""}
                      onChange={(e) => patch(l.id, { quality: (e.target.value || null) as LeadQuality | null })}
                      style={{ ...inputStyle, padding: "5px 7px", fontSize: 11.5, width: "auto", minWidth: 92 }}
                    >
                      <option value="">—</option>
                      {LEAD_QUALITIES.map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </td>

                  <td style={{ ...cell, fontSize: 11, color: C.textMuted, lineHeight: 1.5, maxWidth: 170 }}>
                    {l.ugcGoal || "—"}
                    {l.experienceLevel && <div style={{ color: C.textFaint }}>{l.experienceLevel}</div>}
                    {l.biggestBlocker && <div style={{ color: C.textFaint }}>Stuck on: {l.biggestBlocker}</div>}
                  </td>

                  <td style={cell}>
                    <NoteCell lead={l} onSave={(notes) => patch(l.id, { notes })} />
                  </td>

                  <td style={{ ...cell, textAlign: "right" }}>
                    <button
                      onClick={() => drop(l)}
                      title="Remove"
                      style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showSources && (
        <SourcesModal
          sources={sources}
          counts={counts}
          organizationId={profile.organization_id}
          onClose={() => setShowSources(false)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

// Saved on blur rather than per keystroke: a note gets typed in one go while
// the call is live, and a write per character would be both wasteful and
// prone to landing out of order.
function NoteCell({ lead, onSave }: { lead: Lead; onSave: (notes: string) => void }) {
  const [value, setValue] = useState(lead.notes || "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(lead.notes || "");
  }, [lead.notes]);

  return (
    <textarea
      value={value}
      placeholder="What to know before you ring…"
      onChange={(e) => {
        setValue(e.target.value);
        setDirty(true);
      }}
      onBlur={() => {
        if (!dirty) return;
        setDirty(false);
        onSave(value.trim());
      }}
      style={{
        ...inputStyle,
        minHeight: 54,
        minWidth: 210,
        fontSize: 11.5,
        lineHeight: 1.5,
        resize: "vertical",
        padding: "7px 9px",
      }}
    />
  );
}

function SourcesModal({
  sources, counts, organizationId, onClose, onChanged,
}: {
  sources: LeadSource[];
  counts: Map<string, number>;
  organizationId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [label, setLabel] = useState("");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // /get/<slug> rather than ?src=<slug>. netlify.toml serves it as a rewrite,
  // so the slug stays in the address bar the whole way through — which is
  // what makes attribution survive a refresh mid-funnel, and what makes the
  // link worth putting in a bio.
  const linkFor = (slug: string) => `${FUNNEL_BASE}/get/${encodeURIComponent(slug)}`;

  async function add() {
    if (!label.trim()) return;
    setError("");
    setSaving(true);
    try {
      await createLeadSource(createClient(), organizationId, label, destination || null);
      setLabel("");
      setDestination("");
      onChanged();
    } catch (err) {
      setError(toastMessage(err, "Couldn't make that link — the name may already be taken."));
    } finally {
      setSaving(false);
    }
  }

  async function copy(s: LeadSource) {
    await navigator.clipboard.writeText(linkFor(s.slug));
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <Modal onClose={onClose} title="Deeplinks" width={620}>
      <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.6, marginBottom: 16 }}>
        One link per place you post. Every lead that comes through it is tagged with that name, so you can tell which
        post actually produced calls rather than guessing.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
        <Field label="Where you're putting it">
          <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="IG bio — August" />
        </Field>
        <Field label="Send them to (optional)">
          <input style={inputStyle} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Defaults to your lead magnet" />
        </Field>
      </div>
      {label.trim() && (
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>
          {linkFor(slugify(label))}
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: C.danger, marginBottom: 10 }}>{error}</div>}
      <Button size="sm" onClick={add} disabled={saving || !label.trim()}>
        {saving ? <Loader2 size={12} className="cl-spin" /> : <Plus size={12} />} Make the link
      </Button>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 18, paddingTop: 14, display: "grid", gap: 8 }}>
        {sources.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textFaint }}>No links yet.</div>
        ) : (
          sources.map((s) => (
            <div key={s.id} style={{ background: C.surface2, borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 10.5, color: C.textFaint, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {linkFor(s.slug)}
                </div>
              </div>
              <Badge>{counts.get(s.slug) || 0} leads</Badge>
              <Button size="sm" variant="secondary" onClick={() => copy(s)}>
                {copiedId === s.id ? <Check size={12} /> : <Copy size={12} />}
              </Button>
              <button
                onClick={async () => {
                  if (!confirm(`Retire "${s.label}"? Leads already tagged with it keep the tag.`)) return;
                  try {
                    await archiveLeadSource(createClient(), s.id);
                    onChanged();
                  } catch (err) {
                    showToast(toastMessage(err, "Couldn't retire that link."));
                  }
                }}
                style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}
                title="Retire"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
