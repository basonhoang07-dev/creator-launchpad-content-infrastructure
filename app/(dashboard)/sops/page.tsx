"use client";

// app/(dashboard)/sops/page.tsx — SOP Libraries
//
// Ported from the prototype's SOPPage. Deep link comes from ?tab=&sop= query
// params (set by Sidebar's GlobalSearch) instead of in-memory jumpTo state.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Check, FileText, Film, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, Field, Modal, SectionHeader, EmptyState, inputStyle } from "@/components/ui";
import ImageUploadField from "@/components/ImageUploadField";
import EmbeddedVideoLink from "@/components/EmbeddedVideoLink";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { fetchSops, createSop, updateSop, softDeleteSop, restoreSop, deleteSopForever, type Sop, type SopKind } from "@/lib/queries/sops";
import { useToast, toastMessage } from "@/components/Toast";

function sopAuthorBadge(sop: Sop): { label: string; tone: "accent" | "default" } | null {
  if (!sop.authorName) return null;
  if (sop.authorRole === "Creative Director") return { label: `Creative Director — ${sop.authorName}`, tone: "accent" };
  if (sop.authorRole === "Admin") return { label: sop.authorName, tone: "accent" };
  return { label: sop.authorName, tone: "default" };
}

const emptyForm = { title: "", body: "", thumbnail: "", images: [] as string[], referenceVideoLink: "" };

export default function SOPPage() {
  const { profile, isAdmin } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sops, setSops] = useState<{ ugc: Sop[]; format: Sop[] } | null>(null);
  const [tab, setTab] = useState<SopKind>("ugc");
  const [showAdd, setShowAdd] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [activeSop, setActiveSop] = useState<Sop | null>(null);
  const [editingSop, setEditingSop] = useState<Sop | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [jumpApplied, setJumpApplied] = useState(false);

  const reload = useCallback(async () => {
    // Admin-only while this is still being built out — see Sidebar/GlobalSearch
    // for the matching nav/search gating. Skip the fetch entirely for everyone else.
    if (!isAdmin) return { ugc: [], format: [] };
    const supabase = createClient();
    const data = await fetchSops(supabase, profile.organization_id);
    setSops(data);
    return data;
  }, [profile.organization_id, isAdmin]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!sops || jumpApplied) return;
    setJumpApplied(true);
    const targetTab = searchParams.get("tab");
    const sopId = searchParams.get("sop");
    if (targetTab === "ugc" || targetTab === "format") setTab(targetTab);
    if (sopId) {
      const match = (sops[(targetTab as SopKind) || "ugc"] || []).find((s) => s.id === sopId);
      if (match) setActiveSop(match);
    }
    if (targetTab || sopId) router.replace("/sops");
  }, [sops, jumpApplied, searchParams, router]);

  if (!isAdmin) {
    return <EmptyState icon={BookOpen} text="SOP Libraries isn't available yet." />;
  }

  if (!sops) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  const allInTab = sops[tab];
  const allActive = allInTab.filter((s) => !s.deletedAt);
  const q = search.trim().toLowerCase();
  const list = q ? allActive.filter((s) => (s.title || "").toLowerCase().includes(q) || (s.body || "").toLowerCase().includes(q) || (s.authorName || "").toLowerCase().includes(q)) : allActive;
  const trashed = allInTab.filter((s) => s.deletedAt);
  const isFormatTab = tab === "format";
  const hasFullSopAccess = isAdmin || profile.role === "Creative Director";

  const canAdd = isFormatTab ? true : hasFullSopAccess;
  function canEdit(sop: Sop) {
    if (hasFullSopAccess) return true;
    return isFormatTab && sop.authorName === profile.name;
  }
  const canDelete = canEdit;

  function openAddModal() {
    setForm(emptyForm);
    setEditingSop(null);
    setShowAdd(true);
  }
  function openEditModal(sop: Sop) {
    setForm({ title: sop.title, body: sop.body, thumbnail: sop.thumbnail || "", images: sop.images || [], referenceVideoLink: sop.referenceVideoLink || "" });
    setEditingSop(sop);
    setShowAdd(true);
  }

  async function saveSOP() {
    if (!form.title.trim()) return;
    try {
      const supabase = createClient();
      if (editingSop) {
        await updateSop(supabase, editingSop.id, form);
        setActiveSop((prev) => (prev && prev.id === editingSop.id ? { ...prev, ...form } : prev));
      } else if (isFormatTab) {
        await createSop(supabase, profile.organization_id, tab, { ...form, authorName: profile.name, authorRole: profile.role });
      } else {
        await createSop(supabase, profile.organization_id, tab, form);
      }
      setForm(emptyForm);
      setEditingSop(null);
      setShowAdd(false);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that SOP — try again."));
    }
  }

  async function removeSOP(id: string) {
    try {
      await softDeleteSop(createClient(), id);
      setActiveSop(null);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't delete that SOP — try again."));
    }
  }
  async function handleRestoreSOP(id: string) {
    try {
      await restoreSop(createClient(), id);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't restore that SOP — try again."));
    }
  }
  async function handleDeleteForever(id: string) {
    try {
      await deleteSopForever(createClient(), id);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't permanently delete — try again."));
    }
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Level up"
        title="SOP Libraries"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant={tab === "ugc" ? "primary" : "secondary"} size="sm" onClick={() => setTab("ugc")}>UGC SOPs</Button>
            <Button variant={tab === "format" ? "primary" : "secondary"} size="sm" onClick={() => setTab("format")}>Format SOPs</Button>
            {hasFullSopAccess && (
              <Button variant="secondary" size="sm" onClick={() => setShowTrash(true)}>
                <Trash2 size={13} /> Trash {trashed.length > 0 ? `(${trashed.length})` : ""}
              </Button>
            )}
            {canAdd && <Button size="sm" onClick={openAddModal}><Plus size={14} /> Add SOP</Button>}
          </div>
        }
      />

      {isFormatTab && (
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
          Anyone can contribute a format SOP here — it's labelled with who made it, so it's always clear whether it came from you, your creative director, or a client. Admin and your Creative Director can edit or delete any; authors can edit or delete their own. Deleted SOPs go to Trash and can be restored anytime.
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <input style={{ ...inputStyle, paddingLeft: 34 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${isFormatTab ? "format" : "UGC"} SOPs...`} />
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}>
          <FileText size={14} />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {list.map((s) => {
          const badge = isFormatTab ? sopAuthorBadge(s) : null;
          return (
            <Card key={s.id} style={{ padding: 0, overflow: "hidden", cursor: isFormatTab ? "pointer" : "default" }} onClick={() => isFormatTab && setActiveSop(s)}>
              {isFormatTab && s.thumbnail ? (
                <img src={s.thumbnail} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
              ) : isFormatTab ? (
                <div style={{ width: "100%", height: 120, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Film size={22} color={C.textFaint} />
                </div>
              ) : null}
              <div style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                  {!isFormatTab && (
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <FileText size={16} color={C.accentLight} />
                    </div>
                  )}
                  {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    {canEdit(s) && (
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(s); }} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Pencil size={13} /></button>
                    )}
                    {canDelete(s) && (
                      <button onClick={(e) => { e.stopPropagation(); removeSOP(s.id); }} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14.5, margin: "12px 0 6px" }}>{s.title}</div>
                <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: isFormatTab ? 2 : 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.body}</div>
                {isFormatTab && s.referenceVideoLink && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.accentLight, marginTop: 10 }}>
                    <Link2 size={12} /> Reference video attached
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {list.length === 0 && <EmptyState icon={BookOpen} text={q ? `No SOPs match "${search}".` : "No SOPs here yet."} />}
      </div>

      {showAdd && (
        <Modal title={`${editingSop ? "Edit" : "Add"} ${isFormatTab ? "Format" : "UGC"} SOP`} onClose={() => { setShowAdd(false); setEditingSop(null); }}>
          <Field label="Title"><input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          {isFormatTab && (
            <ImageUploadField label="Thumbnail" sublabel="Showcases what this format looks like — shown as the card cover." value={form.thumbnail} onChange={(v) => setForm({ ...form, thumbnail: v })} />
          )}
          <Field label="Content">
            <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Walk through the format step by step..." />
          </Field>
          {isFormatTab && (
            <>
              <ImageUploadField label="Additional images" sublabel="Extra reference stills, screenshots, or examples." value={form.images} onChange={(v) => setForm({ ...form, images: v })} multi />
              <Field label="Reference video (link)">
                <input style={inputStyle} value={form.referenceVideoLink} onChange={(e) => setForm({ ...form, referenceVideoLink: e.target.value })} placeholder="Paste a link to an example video" />
              </Field>
              <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14 }}>
                {editingSop
                  ? `Original creator stays credited as ${sopAuthorBadge(editingSop)?.label || editingSop.authorName} even if you edit it.`
                  : `This will be labelled as ${profile.role === "Creative Director" ? `"Creative Director — ${profile.name}"` : `"${profile.name}"`}.`}
              </div>
            </>
          )}
          <Button style={{ width: "100%", justifyContent: "center" }} onClick={saveSOP}>{editingSop ? "Save changes" : "Save SOP"}</Button>
        </Modal>
      )}

      {activeSop && (
        <Modal title={activeSop.title} onClose={() => setActiveSop(null)} width={560}>
          {activeSop.thumbnail && <img src={activeSop.thumbnail} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, marginBottom: 14 }} />}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            {(() => {
              const b = sopAuthorBadge(activeSop);
              return b ? <Badge tone={b.tone}>{b.label}</Badge> : null;
            })()}
            {canEdit(activeSop) && (
              <Button size="sm" variant="secondary" onClick={() => { setActiveSop(null); openEditModal(activeSop); }}><Pencil size={12} /> Edit</Button>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 16 }}>{activeSop.body}</div>
          {activeSop.images && activeSop.images.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 8, fontWeight: 600 }}>Reference images</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {activeSop.images.map((img, i) => (
                  <img key={i} src={img} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                ))}
              </div>
            </div>
          )}
          <EmbeddedVideoLink url={activeSop.referenceVideoLink} label="Reference video" />
        </Modal>
      )}

      {showTrash && (
        <Modal title={`Trash — ${isFormatTab ? "Format" : "UGC"} SOPs`} onClose={() => setShowTrash(false)} width={520}>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Deleted SOPs land here and can be restored anytime.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {trashed.map((s) => {
              const badge = isFormatTab ? sopAuthorBadge(s) : null;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 10, padding: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</div>
                    {badge && <div style={{ marginTop: 4 }}><Badge tone={badge.tone}>{badge.label}</Badge></div>}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleRestoreSOP(s.id)}><Check size={12} /> Restore</Button>
                  <button onClick={() => handleDeleteForever(s.id)} title="Delete forever" style={{ background: "none", border: "none", color: C.danger, cursor: "pointer" }}><X size={15} /></button>
                </div>
              );
            })}
            {trashed.length === 0 && <EmptyState icon={Trash2} text="Trash is empty." />}
          </div>
        </Modal>
      )}
    </div>
  );
}
