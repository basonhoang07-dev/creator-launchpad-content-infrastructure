"use client";

// app/(dashboard)/kpi/page.tsx — KPI Trackers
//
// Ported from the prototype's KPIPage. Local component state mirrors the DB
// (fetched once, then optimistically updated on input) with writes on
// change (add/remove) or blur (numeric edits) instead of the prototype's
// single in-memory setData() — see lib/queries/kpi.ts for the mapping.

import React, { useCallback, useEffect, useState } from "react";
import { DollarSign, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, Field, SectionHeader, EmptyState, InfoTooltip, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { isSameMonth } from "@/lib/helpers";
import { mapWeeklyLogRow, type WeeklyLogRow } from "@/lib/queries/mappers";
import {
  fetchKPIData, addCampaign as addCampaignRow, updateCampaignField, removeCampaign as removeCampaignRow,
  addBonusTier as addBonusTierRow, addBonusTierWithValues, updateBonusTier as updateBonusTierRow, removeBonusTier as removeBonusTierRow,
  updateKpiField, type Campaign, type UgcKpi,
} from "@/lib/queries/kpi";
import type { ParsedBrief } from "@/lib/parseBriefValidation";
import { useToast, toastMessage } from "@/components/Toast";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, color: C.textMuted }}>{label}</span>
      <span className="cl-mono" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function KPIPage() {
  const { profile } = useSession();
  const clientId = useDefaultScopedClientId();

  if (profile.role !== "Client" && profile.role !== "Admin") {
    return <EmptyState icon={DollarSign} text="KPI Trackers is only available to Client and Admin accounts." />;
  }

  return clientId ? <KPIPageInner clientId={clientId} /> : <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;
}

function KPIPageInner({ clientId }: { clientId: string }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"retainer" | "ugc">("retainer");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kpi, setKpi] = useState<UgcKpi>({ goal: 0, ratePerDeal: 0, closingRate: 0, responseRate: 0 });
  const [loading, setLoading] = useState(true);
  const [newCampaign, setNewCampaign] = useState({ brand: "", rate: "", minPosts: "", maxPosts: "" });
  const [pendingBonusTiers, setPendingBonusTiers] = useState<{ views: number; bonus: number }[]>([]);
  const [showBriefPaste, setShowBriefPaste] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [parsingBrief, setParsingBrief] = useState(false);
  const [briefError, setBriefError] = useState("");

  const [retainerActualThisMonth, setRetainerActualThisMonth] = useState(0);
  const [videosActualThisMonth, setVideosActualThisMonth] = useState(0);
  const [ugcOneOffActualThisMonth, setUgcOneOffActualThisMonth] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [kpiData, { data: logRows }] = await Promise.all([
      fetchKPIData(supabase, clientId),
      supabase.from("weekly_logs").select("*, weekly_log_campaign_entries(*)").eq("client_id", clientId),
    ]);
    setCampaigns(kpiData.campaigns);
    setKpi(kpiData.kpi);

    const monthLogs = ((logRows || []) as WeeklyLogRow[]).map(mapWeeklyLogRow).filter((l) => isSameMonth(l.weekOf));
    setRetainerActualThisMonth(
      monthLogs.reduce((sum, l) => sum + l.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0), 0)
    );
    setVideosActualThisMonth(monthLogs.reduce((sum, l) => sum + l.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0), 0));
    setUgcOneOffActualThisMonth(monthLogs.reduce((sum, l) => sum + (l.ugcOneOff || 0), 0));
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const totals = campaigns.reduce(
    (acc, c) => {
      const monthly = (Number(c.rate) || 0) * (Number(c.maxPosts) || 0) * 30;
      acc.monthly += monthly;
      acc.dailyMax += Number(c.maxPosts) || 0;
      acc.dailyMin += Number(c.minPosts) || 0;
      return acc;
    },
    { monthly: 0, dailyMax: 0, dailyMin: 0 }
  );

  const dealsNeeded = kpi.ratePerDeal > 0 ? kpi.goal / kpi.ratePerDeal : 0;
  const responsesNeeded = kpi.closingRate > 0 ? dealsNeeded / (kpi.closingRate / 100) : 0;
  const outreachNeeded = kpi.responseRate > 0 ? responsesNeeded / (kpi.responseRate / 100) : 0;
  const outreachPerDay = outreachNeeded / 30;

  async function handleAddCampaign() {
    if (!newCampaign.brand || !newCampaign.rate || !newCampaign.maxPosts) return;
    try {
      const supabase = createClient();
      const created = await addCampaignRow(
        supabase,
        clientId,
        newCampaign.brand.trim(),
        Number(newCampaign.rate),
        Number(newCampaign.minPosts) || 0,
        Number(newCampaign.maxPosts)
      );
      // Bonus tiers extracted from a pasted brief (if any) get created right
      // after the campaign itself, since they need a real campaign_id to
      // attach to — can't be written in the same insert as the campaign.
      let bonusTiers = created.bonusTiers;
      if (pendingBonusTiers.length > 0) {
        const tierResults = await Promise.all(pendingBonusTiers.map((t) => addBonusTierWithValues(supabase, created.id, t.views, t.bonus)));
        bonusTiers = tierResults;
      }
      setCampaigns((prev) => [...prev, { ...created, bonusTiers }]);
      setNewCampaign({ brand: "", rate: "", minPosts: "", maxPosts: "" });
      setPendingBonusTiers([]);
      setBriefText("");
      setShowBriefPaste(false);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't add that campaign — try again."));
    }
  }

  async function handleParseBrief() {
    if (!briefText.trim()) return;
    setBriefError("");
    setParsingBrief(true);
    try {
      const res = await fetch("/api/claude/parse-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, briefText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't parse that brief");
      const parsed: ParsedBrief = json.parsed;
      setNewCampaign({
        brand: parsed.brand,
        rate: parsed.rate ? String(parsed.rate) : "",
        minPosts: parsed.minPosts ? String(parsed.minPosts) : "",
        maxPosts: parsed.maxPosts ? String(parsed.maxPosts) : "",
      });
      setPendingBonusTiers(parsed.bonusTiers);
    } catch (err) {
      setBriefError(toastMessage(err, "Couldn't parse that brief — try again or fill in the fields manually."));
    } finally {
      setParsingBrief(false);
    }
  }

  function updateLocalCampaign(id: string, field: "rate" | "minPosts" | "maxPosts" | "sessionCapacity", value: string) {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: Number(value) || 0 } : c)));
  }
  async function persistCampaign(id: string, field: "rate" | "minPosts" | "maxPosts" | "sessionCapacity") {
    const c = campaigns.find((x) => x.id === id);
    if (!c) return;
    try {
      await updateCampaignField(createClient(), id, field, c[field]);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that change — reverting."));
      reload();
    }
  }

  async function handleRemoveCampaign(id: string) {
    const previous = campaigns;
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    try {
      await removeCampaignRow(createClient(), id);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't remove that campaign — restoring."));
      setCampaigns(previous);
    }
  }

  async function handleAddBonusTier(campaignId: string) {
    try {
      const supabase = createClient();
      const tier = await addBonusTierRow(supabase, campaignId);
      setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, bonusTiers: [...c.bonusTiers, tier] } : c)));
    } catch (err) {
      showToast(toastMessage(err, "Couldn't add that bonus tier — try again."));
    }
  }
  function updateLocalBonusTier(campaignId: string, tierId: string, field: "views" | "bonus", value: string) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? { ...c, bonusTiers: c.bonusTiers.map((t) => (t.id === tierId ? { ...t, [field]: Number(value) || 0 } : t)) }
          : c
      )
    );
  }
  async function persistBonusTier(campaignId: string, tierId: string, field: "views" | "bonus") {
    const c = campaigns.find((x) => x.id === campaignId);
    const t = c?.bonusTiers.find((x) => x.id === tierId);
    if (!t) return;
    try {
      await updateBonusTierRow(createClient(), tierId, field, t[field]);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that bonus tier — reverting."));
      reload();
    }
  }
  async function handleRemoveBonusTier(campaignId: string, tierId: string) {
    const previous = campaigns;
    setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, bonusTiers: c.bonusTiers.filter((t) => t.id !== tierId) } : c)));
    try {
      await removeBonusTierRow(createClient(), tierId);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't remove that bonus tier — restoring."));
      setCampaigns(previous);
    }
  }

  function updateLocalKpi(field: keyof UgcKpi, value: string) {
    setKpi((prev) => ({ ...prev, [field]: Number(value) || 0 }));
  }
  async function persistKpi(field: keyof UgcKpi) {
    try {
      await updateKpiField(createClient(), clientId, field, kpi[field]);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that change — reverting."));
      reload();
    }
  }

  const miniInput = { ...inputStyle, padding: "5px 8px", fontSize: 12.5, width: 72 };

  if (loading) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  return (
    <div>
      <SectionHeader
        eyebrow="Track your money"
        title="KPI Trackers"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant={tab === "retainer" ? "primary" : "secondary"} size="sm" onClick={() => setTab("retainer")}>
              Retainer UGC
            </Button>
            <Button variant={tab === "ugc" ? "primary" : "secondary"} size="sm" onClick={() => setTab("ugc")}>
              UGC KPI
            </Button>
          </div>
        }
      />

      {tab === "retainer" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Active campaigns</div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {campaigns.map((c) => {
                const monthly = (Number(c.rate) || 0) * (Number(c.maxPosts) || 0) * 30;
                const needsSetup = !c.rate && !c.maxPosts;
                return (
                  <div key={c.id} style={{ background: C.surface2, border: needsSetup ? `1px solid ${C.warning}` : `1px solid transparent`, borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: needsSetup ? 10 : 0 }}>
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.brand}</div>
                      {needsSetup && <Badge tone="warning">Needs setup</Badge>}
                      <div className="cl-mono" style={{ fontSize: 15, fontWeight: 600, color: monthly ? C.success : C.textFaint }}>
                        ${monthly.toLocaleString()}
                        <span style={{ fontSize: 10, color: C.textFaint }}>/mo</span>
                      </div>
                      <button onClick={() => handleRemoveCampaign(c.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.textMuted }}>
                        $
                        <input
                          type="number"
                          style={miniInput}
                          value={c.rate || ""}
                          placeholder="0"
                          onChange={(e) => updateLocalCampaign(c.id, "rate", e.target.value)}
                          onBlur={() => persistCampaign(c.id, "rate")}
                        />
                        /video
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.textMuted }}>
                        min{" "}
                        <input
                          type="number"
                          style={miniInput}
                          value={c.minPosts || ""}
                          placeholder="0"
                          onChange={(e) => updateLocalCampaign(c.id, "minPosts", e.target.value)}
                          onBlur={() => persistCampaign(c.id, "minPosts")}
                        />
                        /day
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.textMuted }}>
                        max{" "}
                        <input
                          type="number"
                          style={miniInput}
                          value={c.maxPosts || ""}
                          placeholder="0"
                          onChange={(e) => updateLocalCampaign(c.id, "maxPosts", e.target.value)}
                          onBlur={() => persistCampaign(c.id, "maxPosts")}
                        />
                        /day
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.textMuted }}>
                        <input
                          type="number"
                          style={miniInput}
                          value={c.sessionCapacity || ""}
                          placeholder="0"
                          onChange={(e) => updateLocalCampaign(c.id, "sessionCapacity", e.target.value)}
                          onBlur={() => persistCampaign(c.id, "sessionCapacity")}
                        />
                        /session capacity
                      </label>
                      <InfoTooltip text="How many videos this client can realistically film in one sitting. If your KPI needs more per day than they can film per session, the scheduler flags the gap instead of silently overbooking them." />
                    </div>
                    {c.sessionCapacity > 0 && c.maxPosts > c.sessionCapacity && (
                      <div style={{ fontSize: 10.5, color: C.warning, marginTop: 6 }}>
                        Your KPI needs {c.maxPosts}/day but you can only film {c.sessionCapacity}/session — the scheduler will flag this gap instead of overbooking you.
                      </div>
                    )}

                    <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600 }}>View bonus tiers (optional)</div>
                        <InfoTooltip text="Extra pay for a video that crosses a view-count threshold. Only the highest tier a video actually reaches counts — tiers don't stack, and a threshold set to 0 views is treated as unreachable, not automatic." />
                      </div>
                      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                        {c.bonusTiers.map((t) => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.textMuted }}>
                            <input
                              type="number"
                              style={{ ...miniInput, width: 88 }}
                              value={t.views}
                              onChange={(e) => updateLocalBonusTier(c.id, t.id, "views", e.target.value)}
                              onBlur={() => persistBonusTier(c.id, t.id, "views")}
                            />
                            <span>views = +$</span>
                            <input
                              type="number"
                              style={{ ...miniInput, width: 64 }}
                              value={t.bonus}
                              onChange={(e) => updateLocalBonusTier(c.id, t.id, "bonus", e.target.value)}
                              onBlur={() => persistBonusTier(c.id, t.id, "bonus")}
                            />
                            <button onClick={() => handleRemoveBonusTier(c.id, t.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => handleAddBonusTier(c.id)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.accentLight, background: "none", border: "none", cursor: "pointer" }}>
                        <Plus size={12} /> Add bonus tier
                      </button>
                    </div>
                  </div>
                );
              })}
              {campaigns.length === 0 && <EmptyState icon={DollarSign} text="No campaigns yet — add one below." />}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Add a campaign</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => setShowBriefPaste((v) => !v)}
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.accentLight, background: "none", border: "none", cursor: "pointer" }}
                  >
                    <Sparkles size={12} /> {showBriefPaste ? "Fill in manually instead" : "Paste a brief (AI)"}
                  </button>
                  {!showBriefPaste && <InfoTooltip text="Uses AI credit — paste a brand brief, contract, or deal email and Claude extracts the rate, daily volume, and bonus tiers for you to review before saving." />}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 10 }}>Also creates a matching script board on the Content Calendar, if one doesn't exist yet.</div>

              {showBriefPaste && (
                <div style={{ marginBottom: 14 }}>
                  <textarea
                    style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
                    value={briefText}
                    onChange={(e) => setBriefText(e.target.value)}
                    placeholder="Paste the brand brief, contract terms, or deal email — Claude pulls out the rate, daily volume, and any view-bonus structure."
                  />
                  {briefError && (
                    <div style={{ fontSize: 11, color: C.danger, marginTop: 6 }}>{briefError}</div>
                  )}
                  <Button size="sm" variant="secondary" style={{ marginTop: 8 }} onClick={handleParseBrief} disabled={parsingBrief || !briefText.trim()}>
                    {parsingBrief ? <Loader2 size={13} className="cl-spin" /> : <Sparkles size={13} />}
                    {parsingBrief ? "Reading brief..." : "Parse with Claude"}
                  </Button>
                  {pendingBonusTiers.length > 0 && (
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                      Found {pendingBonusTiers.length} bonus tier{pendingBonusTiers.length > 1 ? "s" : ""}: {pendingBonusTiers.map((t) => `${t.views.toLocaleString()} views = +$${t.bonus}`).join(", ")} — review the fields below, then Add.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.8fr auto", gap: 8, alignItems: "end" }}>
                <Field label="Brand">
                  <input style={inputStyle} value={newCampaign.brand} onChange={(e) => setNewCampaign({ ...newCampaign, brand: e.target.value })} placeholder="Brand name" />
                </Field>
                <Field label="Rate/video">
                  <input style={inputStyle} type="number" value={newCampaign.rate} onChange={(e) => setNewCampaign({ ...newCampaign, rate: e.target.value })} placeholder="25" />
                </Field>
                <Field label="Min/day">
                  <input style={inputStyle} type="number" value={newCampaign.minPosts} onChange={(e) => setNewCampaign({ ...newCampaign, minPosts: e.target.value })} placeholder="1" />
                </Field>
                <Field label="Max/day">
                  <input style={inputStyle} type="number" value={newCampaign.maxPosts} onChange={(e) => setNewCampaign({ ...newCampaign, maxPosts: e.target.value })} placeholder="2" />
                </Field>
                <Button size="sm" onClick={handleAddCampaign} style={{ marginBottom: 14 }}>
                  <Plus size={14} /> Add
                </Button>
              </div>
            </div>
          </Card>

          <Card style={{ background: `linear-gradient(160deg, ${C.accentDim}, ${C.surface})` }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>MAX MONTHLY RETAINER</div>
            <div className="cl-mono" style={{ fontSize: 34, fontWeight: 700 }}>${totals.monthly.toLocaleString()}</div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ color: C.textMuted }}>Actual so far this month</span>
                <span className="cl-mono" style={{ fontWeight: 700, color: C.success }}>${retainerActualThisMonth.toLocaleString()}</span>
              </div>
              <div style={{ width: "100%", height: 6, background: C.surface3, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${totals.monthly > 0 ? Math.min(100, (retainerActualThisMonth / totals.monthly) * 100) : 0}%`, height: "100%", background: C.success, borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 4 }}>{videosActualThisMonth} videos logged so far · from your weekly logs</div>
            </div>

            <div style={{ height: 1, background: C.border, margin: "18px 0" }} />
            <div style={{ display: "grid", gap: 10 }}>
              <Row label="Content needed / day" value={totals.dailyMax} />
              <Row label="Content needed / month" value={totals.dailyMax * 30} />
              <Row label="Minimum floor / day" value={totals.dailyMin} />
            </div>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 16, lineHeight: 1.5 }}>
              No cap on daily volume — bandwidth conflicts across campaigns are self-managed. This total feeds directly into Content Calendar's auto-scheduling.
            </div>
          </Card>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Your inputs</div>
            <Field label="Monthly revenue goal ($)">
              <input style={inputStyle} type="number" value={kpi.goal} onChange={(e) => updateLocalKpi("goal", e.target.value)} onBlur={() => persistKpi("goal")} />
            </Field>
            <Field label="Rate per deal ($)">
              <input style={inputStyle} type="number" value={kpi.ratePerDeal} onChange={(e) => updateLocalKpi("ratePerDeal", e.target.value)} onBlur={() => persistKpi("ratePerDeal")} />
            </Field>
            <Field label="Closing rate (%)">
              <input style={inputStyle} type="number" value={kpi.closingRate} onChange={(e) => updateLocalKpi("closingRate", e.target.value)} onBlur={() => persistKpi("closingRate")} />
            </Field>
            <Field label="Response rate (%)">
              <input style={inputStyle} type="number" value={kpi.responseRate} onChange={(e) => updateLocalKpi("responseRate", e.target.value)} onBlur={() => persistKpi("responseRate")} />
            </Field>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>Runs on the current period only — start a new period manually once this one's done.</div>
          </Card>

          <Card style={{ background: `linear-gradient(160deg, ${C.accentDim}, ${C.surface})` }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>OUTREACH NEEDED / DAY</div>
            <div className="cl-mono" style={{ fontSize: 34, fontWeight: 700 }}>{outreachPerDay.toFixed(1)}</div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ color: C.textMuted }}>Actual one-off cash this month</span>
                <span className="cl-mono" style={{ fontWeight: 700, color: C.success }}>
                  ${ugcOneOffActualThisMonth.toLocaleString()} / ${(kpi.goal || 0).toLocaleString()}
                </span>
              </div>
              <div style={{ width: "100%", height: 6, background: C.surface3, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${kpi.goal > 0 ? Math.min(100, (ugcOneOffActualThisMonth / kpi.goal) * 100) : 0}%`, height: "100%", background: C.success, borderRadius: 4 }} />
              </div>
            </div>

            <div style={{ height: 1, background: C.border, margin: "18px 0" }} />
            <div style={{ display: "grid", gap: 10 }}>
              <Row label="Deals needed" value={dealsNeeded.toFixed(1)} />
              <Row label="Responses needed" value={responsesNeeded.toFixed(1)} />
              <Row label="Total outreach needed" value={Math.ceil(outreachNeeded)} />
            </div>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 16, lineHeight: 1.5 }}>
              Goal ÷ rate → deals. Deals ÷ closing rate → responses. Responses ÷ response rate → outreach. Recalculates each time you log progress.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
