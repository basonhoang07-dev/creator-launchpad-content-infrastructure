"use client";

// app/(dashboard)/calendar/page.tsx — Content Calendar
//
// Ported from the prototype's ContentCalendarPage. AI features now call the
// real /api/claude/* routes instead of building prompts client-side. Deep
// links (brand/view/entry) come from ?brand=&view=&entry= query params
// instead of the prototype's in-memory jumpTo state.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, CalendarCheck, CalendarClock, CalendarDays, Check, ChevronRight, ExternalLink, Folder, Layers, Loader2,
  Lock, Plus, Repeat, Shuffle, Sparkles, StickyNote, Table2, Target, Trash2, TrendingUp, Users, Video, Wand2, X,
} from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, Field, Modal, ConfirmModal, SectionHeader, EmptyState, InfoTooltip, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { isSameMonth, todayPlus, getWeekKey, nextOccurrence } from "@/lib/helpers";
import { updateCampaignField } from "@/lib/queries/kpi";
import {
  fetchCalendarPageData, insertEntry, updateEntryFields, deleteEntry as deleteEntryRow, restoreEntry as restoreEntryRow,
  deleteEntryForever as deleteEntryForeverRow, bonusForEntry, applyBonusToLog, insertRepeatEntry, materializeDueTemplates,
  deleteTemplate, createBoard, computeAutoSchedule, applyAutoSchedule,
  type CalendarEntry, type CalendarPageData,
} from "@/lib/queries/calendar";
import ScriptTable, { BrandTab, StatusSelect, STATUS_ORDER } from "@/components/calendar/ScriptTable";
import CalendarGridView from "@/components/calendar/CalendarGridView";
import AvailabilityEditor from "@/components/calendar/AvailabilityEditor";
import CommentThread from "@/components/calendar/CommentThread";
import AdaptScriptModal from "@/components/calendar/AdaptScriptModal";
import EmbeddedVideoLink from "@/components/EmbeddedVideoLink";
import { SchedulePreviewModal, CapacitySetupModal, NewBoardWizard, ConnectCalendarGate, type ScheduleSummary, type NewBoardPayload } from "@/components/calendar/modals";
import { useToast, toastMessage } from "@/components/Toast";

export default function ContentCalendarPage() {
  const { profile, workingClient } = useSession();
  const clientId = useDefaultScopedClientId();

  if (profile.role === "Creative Director" && !workingClient) {
    return (
      <div>
        <SectionHeader eyebrow="One step first" title="Content Calendar" />
        <Card style={{ textAlign: "center", padding: "52px 32px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <Users size={24} color={C.accentLight} />
          </div>
          <h3 className="cl-display" style={{ fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>Select a client to start scripting</h3>
          <p style={{ fontSize: 13.5, color: C.textMuted, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Use the "Working in" switcher at the top of your sidebar to choose which client's portal you want to work in — you'll only be able to select clients your Admin has invited you into.
          </p>
        </Card>
      </div>
    );
  }

  return clientId ? <ContentCalendarInner clientId={clientId} /> : <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;
}

function ContentCalendarInner({ clientId }: { clientId: string }) {
  const { profile, workingClient } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pageData, setPageData] = useState<CalendarPageData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const data = await fetchCalendarPageData(supabase, clientId);
    setPageData(data);
    setLoading(false);
    return data;
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Materialize any due recurring templates once per load.
  useEffect(() => {
    (async () => {
      if (!pageData) return;
      const supabase = createClient();
      const changed = await materializeDueTemplates(supabase, clientId, pageData.templates);
      if (changed) reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pageData]);

  const [view, setView] = useState<"availability" | "table" | "calendar">("availability");
  const [activeBrand, setActiveBrand] = useState("All");
  const [jumpApplied, setJumpApplied] = useState(false);

  useEffect(() => {
    if (!pageData || jumpApplied) return;
    setJumpApplied(true);
    const brand = searchParams.get("brand");
    const v = searchParams.get("view");
    const entryId = searchParams.get("entry");

    if (brand) setActiveBrand(brand);

    if (v === "table" || v === "calendar" || v === "availability") {
      setView(v);
    } else {
      setView(pageData.availabilityBlocks.length > 0 ? "table" : "availability");
    }

    if (entryId) {
      const match = pageData.entries.find((c) => c.id === entryId);
      if (match) setActiveEntry(match);
    }

    if (brand || v || entryId) router.replace("/calendar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, jumpApplied]);

  const [showAddConcept, setShowAddConcept] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAdapt, setShowAdapt] = useState(false);
  const [showCapacitySetup, setShowCapacitySetup] = useState(false);
  const [pendingScheduleAction, setPendingScheduleAction] = useState<"auto" | "claude" | null>(null);
  const [showCalTrash, setShowCalTrash] = useState(false);
  const [activeEntry, setActiveEntry] = useState<CalendarEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CalendarEntry | null>(null);
  const [confirmDeleteForever, setConfirmDeleteForever] = useState<{ trashId: string; entry: CalendarEntry } | null>(null);
  const [form, setForm] = useState({ brand: "", title: "", format: "", recurFreq: "none" });
  const [planningWithClaude, setPlanningWithClaude] = useState(false);
  const [planError, setPlanError] = useState("");
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSummary | null>(null);
  useEffect(() => {
    setPlanError("");
  }, [activeBrand]);
  const [gettingFeedback, setGettingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [scriptFeedback, setScriptFeedback] = useState("");
  useEffect(() => {
    setFeedbackError("");
    setScriptFeedback("");
  }, [activeEntry?.id]);

  // Once capacity gets saved via the setup modal, automatically run whichever
  // scheduling action was waiting on it. Must live above the early returns
  // below (loading / gcal-not-connected) — every hook in this component has
  // to run on every render regardless of which branch the JSX ends up
  // taking, or React throws a "hooks called in a different order" error the
  // very first time gcalConnected flips from false to true (i.e. right after
  // clicking "Connect Google Calendar", since that's exactly when this
  // component starts rendering past the early return for the first time).
  useEffect(() => {
    if (!pageData || !pendingScheduleAction) return;
    const activeCampaignForCap = activeBrand !== "All" ? pageData.campaigns.find((c) => c.brand === activeBrand) : null;
    const capacitySet = activeBrand === "All" || (!!activeCampaignForCap && Number(activeCampaignForCap.sessionCapacity) > 0);
    if (!capacitySet) return;
    if (pendingScheduleAction === "auto") autoSchedule();
    else planCalendarWithClaude();
    setPendingScheduleAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, activeBrand, pendingScheduleAction]);

  if (loading || !pageData) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;
  const data = pageData;

  async function handleConnectGcal() {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("integrations").upsert({ client_id: clientId, integration_key: "gcal", connected: true }, { onConflict: "client_id,integration_key" });
      if (error) throw error;
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't connect Google Calendar — try again."));
    }
  }

  if (!data.gcalConnected) {
    return <ConnectCalendarGate onConnect={handleConnectGcal} />;
  }

  const availabilityConfigured = data.availabilityBlocks.length > 0;
  const entries = data.entries.filter((c) => activeBrand === "All" || c.brand === activeBrand);
  const scheduledAll = [...data.entries].filter((c) => c.date).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const brandCampaigns = activeBrand === "All" ? data.campaigns : data.campaigns.filter((c) => c.brand === activeBrand);
  const rawVolume = brandCampaigns.reduce((sum, c) => sum + (Number(c.maxPosts) || 0), 0);
  const needsKpiSetup = activeBrand !== "All" && rawVolume === 0;
  const activeCampaign = activeBrand !== "All" ? data.campaigns.find((c) => c.brand === activeBrand) : null;
  const sessionCapacitySet = activeBrand === "All" || (!!activeCampaign && Number(activeCampaign.sessionCapacity) > 0);
  const capacityBelowKpi = !!activeCampaign && Number(activeCampaign.sessionCapacity) > 0 && rawVolume > Number(activeCampaign.sessionCapacity);
  const effectiveVolume = activeCampaign && Number(activeCampaign.sessionCapacity) > 0 ? Math.min(rawVolume, Number(activeCampaign.sessionCapacity)) : rawVolume;
  const dailyVolume = Math.max(1, effectiveVolume);
  const allScripts = data.entries.filter((c) => c.script && c.script.trim());

  function requireCapacityThen(action: "auto" | "claude") {
    if (!sessionCapacitySet) {
      setPendingScheduleAction(action);
      setShowCapacitySetup(true);
    } else if (action === "auto") {
      autoSchedule();
    } else {
      planCalendarWithClaude();
    }
  }

  async function addConcept() {
    if (!form.brand.trim() || !form.title.trim()) return;
    try {
      const supabase = createClient();
      await insertEntry(supabase, clientId, { brand: form.brand, title: form.title, format: form.format || "Talking head" });
      if (form.recurFreq !== "none") {
        const { error } = await supabase.from("templates").insert({
          client_id: clientId, brand: form.brand, title_base: form.title, format: form.format || "Talking head",
          freq: form.recurFreq, next_due: nextOccurrence(todayPlus(0), form.recurFreq),
        });
        if (error) throw error;
      }
      setForm({ brand: "", title: "", format: "", recurFreq: "none" });
      setShowAddConcept(false);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't add that concept — try again."));
    }
  }

  async function quickAddEntry(status: string, title: string) {
    const brand = activeBrand !== "All" ? activeBrand : data.brands[0] || "Unassigned";
    try {
      const supabase = createClient();
      const created = await insertEntry(supabase, clientId, { brand, title, format: "" });
      if (status !== "Unscripted") {
        await updateEntryFields(supabase, created.id, { status });
      }
      await reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't add that page — try again."));
    }
  }

  async function autoSchedule() {
    try {
      const supabase = createClient();
      const batchId = `batch-${Date.now()}`;
      const unscheduledForBrand = data.entries.filter((c) => !c.date && (activeBrand === "All" || c.brand === activeBrand));
      const placements = computeAutoSchedule(unscheduledForBrand, scheduledAll, data.availabilityBlocks, dailyVolume);
      await applyAutoSchedule(supabase, placements, batchId);
      const fresh = await reload();
      const placed = fresh.entries.filter((c) => c.batch === batchId).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setScheduleSummary({ source: "auto", rationale: "", entries: placed.map((c) => ({ id: c.id, title: c.title, format: c.format, date: c.date!, invented: false })) });
    } catch (err) {
      showToast(toastMessage(err, "Auto-schedule failed — try again."));
    }
  }

  async function planCalendarWithClaude() {
    if (activeBrand === "All") {
      setPlanError("Select a specific brand board first — Claude plans one board at a time.");
      return;
    }
    setPlanError("");
    setPlanningWithClaude(true);
    try {
      const res = await fetch("/api/claude/plan-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, brand: activeBrand }),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "Plan failed");
      const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
      if (assignments.length === 0) throw new Error("Empty plan returned");

      await reload();
      setScheduleSummary({
        source: "claude",
        rationale: parsed.rationale || "",
        entries: assignments.map((a: any) => ({ id: a.id, title: a.title, format: a.format, date: a.date, invented: !a.conceptId })),
      });
    } catch (err) {
      setPlanError(toastMessage(err, "Couldn't get a plan from Claude — try again, or use basic Auto-schedule instead."));
    } finally {
      setPlanningWithClaude(false);
    }
  }

  function patchLocalEntry(id: string, patch: Partial<CalendarEntry>) {
    setPageData((prev) => (prev ? { ...prev, entries: prev.entries.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : prev));
    setActiveEntry((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  async function updateEntry(id: string, patch: Partial<CalendarEntry>) {
    patchLocalEntry(id, patch);
    try {
      await updateEntryFields(createClient(), id, patch);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that change — reverting."));
      reload(); // the optimistic patch above never made it to the DB — resync to the real state
    }
  }

  async function handleApplyBonus(entry: CalendarEntry) {
    try {
      const supabase = createClient();
      await applyBonusToLog(supabase, clientId, entry, data.campaigns, getWeekKey());
      patchLocalEntry(entry.id, { bonusLogged: true });
    } catch (err) {
      showToast(toastMessage(err, "Couldn't log that bonus — try again."));
    }
  }

  async function handleRepeatWinningConcept(entry: CalendarEntry) {
    try {
      const supabase = createClient();
      const created = await insertRepeatEntry(supabase, clientId, entry);
      setPageData((prev) => (prev ? { ...prev, entries: [...prev.entries, created] } : prev));
      setActiveEntry(created);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't repeat that concept — try again."));
    }
  }

  async function getScriptFeedback(entry: CalendarEntry) {
    if (!entry.script || !entry.script.trim()) return;
    setFeedbackError("");
    setScriptFeedback("");
    setGettingFeedback(true);
    try {
      const res = await fetch("/api/claude/script-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, entryId: entry.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Feedback failed");
      setScriptFeedback(json.feedback);
    } catch (err) {
      setFeedbackError(toastMessage(err, "Couldn't reach Claude — try again in a moment."));
    } finally {
      setGettingFeedback(false);
    }
  }

  async function handleDeleteEntry(entry: CalendarEntry) {
    try {
      const supabase = createClient();
      await deleteEntryRow(supabase, entry, clientId);
      setPageData((prev) => (prev ? { ...prev, entries: prev.entries.filter((c) => c.id !== entry.id) } : prev));
      setActiveEntry((prev) => (prev && prev.id === entry.id ? null : prev));
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't delete that entry — try again."));
    }
  }
  async function handleRestoreEntry(trashId: string, entry: CalendarEntry) {
    try {
      await restoreEntryRow(createClient(), trashId, entry, clientId);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't restore that entry — try again."));
    }
  }
  async function handleDeleteEntryForever(trashId: string, entry: CalendarEntry) {
    try {
      await deleteEntryForeverRow(createClient(), trashId, clientId, entry.driveFolderId);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't permanently delete — try again."));
    }
  }

  async function rescheduleEntry(id: string, newDate: string) {
    await updateEntry(id, { date: newDate });
  }

  async function saveSessionCapacity(value: string) {
    if (!activeCampaign) return;
    try {
      await updateCampaignField(createClient(), activeCampaign.id, "sessionCapacity", Number(value) || 0);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save filming capacity — try again."));
    }
  }

  async function handleCreateBoard(payload: NewBoardPayload) {
    try {
      await createBoard(createClient(), clientId, payload);
      setActiveBrand(payload.name);
      setShowAddBrand(false);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't create that board — try again."));
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await deleteTemplate(createClient(), id);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't delete that template — try again."));
    }
  }

  const viewTabs = [
    { id: "availability" as const, label: "Availability", icon: CalendarClock },
    { id: "table" as const, label: "Script Table", icon: Table2 },
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
  ];

  return (
    <div>
      <SectionHeader
        eyebrow="Plan the shoot"
        title="Content Calendar"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {profile.role === "Creative Director" && workingClient && (
              <span className="cl-mono" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.accentLight, background: C.accentDim, padding: "5px 10px", borderRadius: 20, fontWeight: 700 }}>
                <Users size={11} /> {workingClient.name}
              </span>
            )}
            <span className="cl-mono" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.success, background: "rgba(61,220,132,0.12)", padding: "5px 10px", borderRadius: 20, fontWeight: 700, marginRight: 4 }}>
              <CalendarCheck size={11} /> Synced with Google Calendar
            </span>
            {viewTabs.map((t) => {
              const Icon = t.icon;
              const locked = t.id !== "availability" && !availabilityConfigured;
              return (
                <Button key={t.id} variant={view === t.id ? "primary" : "secondary"} size="sm" onClick={() => setView(t.id)} style={locked ? { opacity: 0.55 } : undefined}>
                  {locked ? <Lock size={12} /> : <Icon size={13} />} {t.label}
                </Button>
              );
            })}
            {data.templates.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setShowTemplates(true)}>
                <Repeat size={13} /> Templates ({data.templates.length})
              </Button>
            )}
          </div>
        }
      />

      {!availabilityConfigured && (view === "table" || view === "calendar") ? (
        <Card style={{ textAlign: "center", padding: "48px 32px" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <CalendarClock size={22} color={C.accentLight} />
          </div>
          <h3 className="cl-display" style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>Set up your availability first</h3>
          <p style={{ fontSize: 13, color: C.textMuted, maxWidth: 400, margin: "0 auto 18px", lineHeight: 1.6 }}>
            Add at least one block — even a single recurring "Filming" day — so auto-schedule knows when you're actually free before it starts placing content.
          </p>
          <Button onClick={() => setView("availability")}><CalendarClock size={14} /> Go to Availability</Button>
        </Card>
      ) : (
        <>
          {(view === "table" || view === "calendar") && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <BrandTab label="All boards" active={activeBrand === "All"} onClick={() => setActiveBrand("All")} icon={Layers} />
              {data.brands.map((b) => {
                const campaign = data.campaigns.find((c) => c.brand === b);
                const monthlyTarget = campaign ? (Number(campaign.maxPosts) || 0) * 30 : 0;
                const filmedThisMonth = data.entries.filter(
                  (c) => c.brand === b && c.date && isSameMonth(c.date) && STATUS_ORDER.indexOf(c.status || "Unscripted") >= STATUS_ORDER.indexOf("Filmed")
                ).length;
                const progress = monthlyTarget > 0 ? { done: filmedThisMonth, target: monthlyTarget, behind: filmedThisMonth < monthlyTarget * (new Date().getDate() / 30) } : null;
                return <BrandTab key={b} label={b} active={activeBrand === b} onClick={() => setActiveBrand(b)} progress={progress} />;
              })}
              <button
                onClick={() => setShowAddBrand(true)}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: C.textMuted, background: "transparent", border: `1px dashed ${C.borderLight}`, borderRadius: 20, padding: "6px 12px", cursor: "pointer" }}
              >
                <Plus size={13} /> New board
              </button>
              {activeBrand !== "All" && (
                <button
                  onClick={() => setShowCapacitySetup(true)}
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: sessionCapacitySet ? C.accentLight : C.textFaint, background: sessionCapacitySet ? C.accentDim : "transparent", border: `1px solid ${sessionCapacitySet ? C.accent : C.border}`, borderRadius: 20, padding: "6px 12px", cursor: "pointer" }}
                >
                  <Video size={12} /> {sessionCapacitySet && activeCampaign ? `${activeCampaign.sessionCapacity}/session` : "Set filming capacity"}
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <Button
                  variant="secondary" size="sm"
                  onClick={() => { setForm({ brand: activeBrand !== "All" ? activeBrand : "", title: "", format: "", recurFreq: "none" }); setShowAddConcept(true); }}
                >
                  <Plus size={14} /> Script a concept
                </Button>
                {view === "table" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Button size="sm" variant="secondary" onClick={() => requireCapacityThen("auto")}>
                        <CalendarCheck size={14} /> Auto-schedule
                      </Button>
                      <InfoTooltip text="Free, instant — fills your existing unscheduled concepts into open filming days in order. Won't invent new concepts or optimize variety." />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Button size="sm" onClick={() => requireCapacityThen("claude")} disabled={planningWithClaude}>
                        {planningWithClaude ? <Loader2 size={14} className="cl-spin" /> : <Sparkles size={14} />}
                        {planningWithClaude ? "Planning..." : "Smart Plan (AI)"}
                      </Button>
                      <InfoTooltip text="Uses AI credit — also invents new concepts when you're low on backlog, varies formats by past performance, and prioritizes already-scripted concepts first." />
                    </div>
                    {activeBrand !== "All" && (
                      <Button size="sm" variant="secondary" onClick={() => setShowAdapt(true)}>
                        <Shuffle size={14} /> Adapt a script
                      </Button>
                    )}
                  </>
                )}
                {data.trash.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => setShowCalTrash(true)}>
                    <Trash2 size={14} /> Trash ({data.trash.length})
                  </Button>
                )}
              </div>
            </div>
          )}

          {planError && (view === "table" || view === "calendar") && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(229,72,77,0.1)", border: `1px solid ${C.danger}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.text }}>
              <AlertCircle size={15} color={C.danger} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{planError}</span>
              <button onClick={() => setPlanError("")} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><X size={14} /></button>
            </div>
          )}

          {needsKpiSetup && (view === "table" || view === "calendar") && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(245,166,35,0.1)", border: `1px solid ${C.warning}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.text }}>
              <Target size={15} color={C.warning} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>This board doesn't have a KPI goal yet, so auto-schedule is defaulting to 1 video/day. Set a real daily volume in KPI Trackers for accurate batching.</span>
            </div>
          )}

          {capacityBelowKpi && activeCampaign && (view === "table" || view === "calendar") && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(245,166,35,0.1)", border: `1px solid ${C.warning}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.text }}>
              <AlertCircle size={15} color={C.warning} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Your KPI needs {rawVolume}/day, but your filming session can only do {activeCampaign.sessionCapacity} — scheduling {dailyVolume}/day for real, not overbooking you. Consider multiple sessions/week or revisiting the KPI target.</span>
            </div>
          )}

          {view === "table" && (
            <ScriptTable entries={entries} editors={data.editors} onOpen={setActiveEntry} onUpdate={updateEntry} onDelete={handleDeleteEntry} onQuickAdd={quickAddEntry} />
          )}

          {view === "calendar" && (
            <CalendarGridView entries={entries} dailyVolume={dailyVolume} onAutoSchedule={() => requireCapacityThen("auto")} onOpen={setActiveEntry} onReschedule={rescheduleEntry} />
          )}
        </>
      )}

      {view === "availability" && (
        <AvailabilityEditor clientId={clientId} blocks={data.availabilityBlocks} onChange={(blocks) => setPageData((prev) => (prev ? { ...prev, availabilityBlocks: blocks } : prev))} />
      )}

      {showAddConcept && (
        <Modal title="Script a new concept" onClose={() => setShowAddConcept(false)}>
          <Field label="Brand board">
            <select style={inputStyle} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
              <option value="">Select a board...</option>
              {data.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Concept title">
            <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Morning routine w/ product" />
          </Field>
          <Field label="Format">
            <input style={inputStyle} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="Talking head, demo, unboxing..." />
          </Field>
          <Field label={<span style={{ display: "flex", alignItems: "center", gap: 6 }}><Repeat size={12} /> Repeat this format</span>}>
            <select style={inputStyle} value={form.recurFreq} onChange={(e) => setForm({ ...form, recurFreq: e.target.value })}>
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          {form.recurFreq !== "none" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(245,166,35,0.1)", border: `1px solid ${C.warning}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 11.5, color: C.text }}>
              <AlertCircle size={14} color={C.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Only the format/structure repeats — a new unscripted concept drops in each cycle, but the hook and script always need to be written fresh. Never reuse the same script twice.</span>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Starts as "Unscripted" until you write it, and sits in the unscheduled bucket until the next auto-schedule batch runs.</div>
          <Button style={{ width: "100%", justifyContent: "center" }} onClick={addConcept}>Add concept</Button>
        </Modal>
      )}

      {showAddBrand && <NewBoardWizard existingBrands={data.brands} onCreate={handleCreateBoard} onClose={() => setShowAddBrand(false)} />}

      {showTemplates && (
        <Modal title="Recurring concept templates" onClose={() => setShowTemplates(false)} width={520}>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
            Only the format/structure repeats on schedule — a fresh unscripted concept drops in each cycle, but every hook and script still needs to be written new.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.templates.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 10, padding: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.titleBase}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{t.brand} · {t.format}</div>
                </div>
                <Badge tone="accent">{{ weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly" }[t.freq] || t.freq}</Badge>
                <span className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint }}>next {t.nextDue}</span>
                <button onClick={() => handleDeleteTemplate(t.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {data.templates.length === 0 && <EmptyState icon={Repeat} text="No recurring templates yet." />}
          </div>
        </Modal>
      )}

      {showAdapt && activeBrand !== "All" && (
        <AdaptScriptModal
          clientId={clientId}
          brand={activeBrand}
          profile={data.brandProfiles[activeBrand] || null}
          allScripts={allScripts}
          onSaveProfile={(brand, p) => setPageData((prev) => (prev ? { ...prev, brandProfiles: { ...prev.brandProfiles, [brand]: p } } : prev))}
          onClose={() => setShowAdapt(false)}
        />
      )}

      {showCapacitySetup && activeBrand !== "All" && (
        <CapacitySetupModal
          brand={activeBrand}
          initialValue={activeCampaign?.sessionCapacity || null}
          onSave={(value) => { saveSessionCapacity(value); setShowCapacitySetup(false); }}
          onClose={() => { setShowCapacitySetup(false); setPendingScheduleAction(null); }}
        />
      )}

      {scheduleSummary && (
        <SchedulePreviewModal
          summary={scheduleSummary}
          onOpenEntry={(id) => {
            setScheduleSummary(null);
            const match = data.entries.find((c) => c.id === id);
            if (match) setActiveEntry(match);
          }}
          onClose={() => setScheduleSummary(null)}
        />
      )}

      {showCalTrash && (
        <Modal title="Deleted scripts" onClose={() => setShowCalTrash(false)} width={520}>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Deleted scripts land here and can be restored anytime.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.trash.map((t) => (
              <div key={t.trashId} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 10, padding: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.entry.title}</div>
                  <div style={{ fontSize: 11, color: C.textFaint }}>{t.entry.brand} · {t.entry.format}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => handleRestoreEntry(t.trashId, t.entry)}><Check size={12} /> Restore</Button>
                <button onClick={() => setConfirmDeleteForever({ trashId: t.trashId, entry: t.entry })} title="Delete forever" style={{ background: "none", border: "none", color: C.danger, cursor: "pointer" }}><X size={15} /></button>
              </div>
            ))}
            {data.trash.length === 0 && <EmptyState icon={Trash2} text="Trash is empty." />}
          </div>
        </Modal>
      )}

      {activeEntry && (
        <Modal title={activeEntry.title} onClose={() => setActiveEntry(null)} width={640}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <Badge tone="accent">{activeEntry.brand}</Badge>
            <Badge>{activeEntry.format}</Badge>
            {activeEntry.date && <Badge>{activeEntry.date}</Badge>}
            <StatusSelect value={activeEntry.status || "Unscripted"} onChange={(v) => updateEntry(activeEntry.id, { status: v })} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Filming date">
              <input type="date" style={inputStyle} value={activeEntry.date || ""} onChange={(e) => updateEntry(activeEntry.id, { date: e.target.value || null })} />
            </Field>
            <Field label="Assigned editor">
              <select style={inputStyle} value={activeEntry.editorProfileId || ""} onChange={(e) => updateEntry(activeEntry.id, { editorProfileId: e.target.value || null })}>
                <option value="">Unassigned</option>
                <option value={profile.id}>{profile.name} (You)</option>
                {data.editors.filter((ed) => ed.id !== profile.id).map((ed) => (
                  <option key={ed.id} value={ed.id}>{ed.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Script</div>
            <Button
              size="sm" variant="secondary"
              onClick={() => getScriptFeedback(activeEntry)}
              disabled={gettingFeedback || !activeEntry.script?.trim()}
              title={!activeEntry.script?.trim() ? "Write a script first" : undefined}
            >
              {gettingFeedback ? <Loader2 size={12} className="cl-spin" /> : <Wand2 size={12} />}
              {gettingFeedback ? "Reviewing..." : "Get feedback from Claude"}
            </Button>
          </div>
          <Field>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
              value={activeEntry.script}
              onChange={(e) => updateEntry(activeEntry.id, { script: e.target.value })}
              placeholder="Write or paste the script here..."
            />
          </Field>
          {feedbackError && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14, marginTop: -6 }}>
              <AlertCircle size={12} /> {feedbackError}
            </div>
          )}
          {scriptFeedback && (
            <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Wand2 size={13} color={C.accentLight} />
                <span className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Claude's feedback — {activeEntry.format || "this format"}
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 8 }}>Using the retention-editing framework + the 7-dimension viral hook checklist</div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{scriptFeedback}</div>
            </div>
          )}

          <Field label="Reference video (link)">
            <input style={inputStyle} value={activeEntry.referenceLink} onChange={(e) => updateEntry(activeEntry.id, { referenceLink: e.target.value })} placeholder="Paste a link to the inspiration/reference video" />
          </Field>
          {activeEntry.referenceLink && <EmbeddedVideoLink url={activeEntry.referenceLink} label="Preview" />}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Raw video (link)">
              <input style={inputStyle} value={activeEntry.rawVideoLink} onChange={(e) => updateEntry(activeEntry.id, { rawVideoLink: e.target.value })} placeholder="Drive link once uploaded" />
            </Field>
            <Field label="Final video (link)">
              <input style={inputStyle} value={activeEntry.finalVideoLink} onChange={(e) => updateEntry(activeEntry.id, { finalVideoLink: e.target.value })} placeholder="Once edited" />
            </Field>
          </div>

          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <TrendingUp size={13} color={C.accentLight} />
              <span className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Performance</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, marginBottom: activeEntry.posted ? 12 : 0, cursor: "pointer" }}>
              <input type="checkbox" checked={!!activeEntry.posted} onChange={(e) => updateEntry(activeEntry.id, { posted: e.target.checked })} />
              Posted
            </label>
            {activeEntry.posted &&
              (() => {
                const tier = bonusForEntry(activeEntry, data.campaigns);
                return (
                  <>
                    <Field label="View count">
                      <input type="number" style={inputStyle} value={activeEntry.viewCount || ""} onChange={(e) => updateEntry(activeEntry.id, { viewCount: Number(e.target.value) || 0 })} placeholder="0" />
                    </Field>
                    {tier ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 12, color: C.success }}>Bonus tier hit: +${tier.bonus} ({tier.views.toLocaleString()}+ views)</span>
                        {activeEntry.bonusLogged ? <Badge tone="success">Logged</Badge> : <Button size="sm" onClick={() => handleApplyBonus(activeEntry)}>Log ${tier.bonus} bonus to this week</Button>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: C.textFaint }}>
                        {(data.campaigns.find((c) => c.brand === activeEntry.brand)?.bonusTiers || []).length > 0 ? "No bonus tier hit yet at this view count." : "No view bonus tiers set up for this brand's campaign."}
                      </div>
                    )}
                    {activeEntry.script && activeEntry.script.trim() && (
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 11.5, color: C.textMuted }}>This one worked — reuse the body with a fresh hook?</span>
                        <Button size="sm" variant="secondary" onClick={() => handleRepeatWinningConcept(activeEntry)}>
                          <Repeat size={13} /> Repeat winning concept
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
          </div>

          <Field label={<span style={{ display: "flex", alignItems: "center", gap: 6 }}><StickyNote size={12} /> Other</span>}>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={activeEntry.notes || ""}
              onChange={(e) => updateEntry(activeEntry.id, { notes: e.target.value })}
              placeholder="Anything else worth noting about this script..."
            />
          </Field>

          <CommentThread entry={activeEntry} onUpdate={(id, patch) => patchLocalEntry(id, patch)} />

          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Folder size={16} color={C.accentLight} />
            {activeEntry.driveFolderUrl ? (
              <>
                <a
                  href={activeEntry.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12.5, color: C.text, flex: 1, textDecoration: "none" }}
                >
                  Drive folder: <span className="cl-mono" style={{ color: C.accentLight }}>File For Editor / {activeEntry.brand} / {activeEntry.title}</span>
                </a>
                <ExternalLink size={13} color={C.textFaint} />
              </>
            ) : data.driveConnected ? (
              <div style={{ fontSize: 12.5, color: C.textFaint, flex: 1 }}>No Drive folder for this script yet (it's created automatically for new scripts going forward).</div>
            ) : (
              <div style={{ fontSize: 12.5, color: C.textFaint, flex: 1 }}>
                No Drive folder yet — <a href="/integrations" style={{ color: C.accentLight }}>connect Google Drive</a> to auto-create one for every script.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="secondary" style={{ flex: 1, justifyContent: "center" }}
              onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/calendar?entry=${activeEntry.id}`)}
            >
              <ExternalLink size={14} /> Copy share link
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(activeEntry)}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this script?"
          body={
            <>
              "{confirmDelete.title}" moves to Trash and can be restored anytime — its Drive folder (if it has one) stays untouched
              until it's permanently deleted.
            </>
          }
          onConfirm={() => handleDeleteEntry(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {confirmDeleteForever && (
        <ConfirmModal
          title="Delete forever?"
          body={
            <>
              "{confirmDeleteForever.entry.title}" can't be restored after this.
              {confirmDeleteForever.entry.driveFolderId
                ? " Its Drive folder also moves to your Google Drive's own trash — recoverable there for about 30 days, same as deleting it by hand."
                : ""}
            </>
          }
          confirmLabel="Delete forever"
          onConfirm={() => handleDeleteEntryForever(confirmDeleteForever.trashId, confirmDeleteForever.entry)}
          onClose={() => setConfirmDeleteForever(null)}
        />
      )}
    </div>
  );
}
