"use client";

// components/WeeklyCheckInWizard.tsx — ported from the prototype's
// WeeklyCheckInWizard + StepShell. Full-screen 7-step wizard writing to
// weekly_logs + weekly_log_campaign_entries (see lib/queries/weeklyCheckIn.ts).

import React, { useEffect, useState } from "react";
import { ArrowRight, Star, X } from "lucide-react";
import { C } from "@/lib/theme";
import { Field, Logo, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { getWeekKey, type WeeklyLog } from "@/lib/helpers";
import { fetchKPIData, type Campaign } from "@/lib/queries/kpi";
import { saveWeeklyLog, type WeeklyLogFormEntry } from "@/lib/queries/weeklyCheckIn";
import { useToast, toastMessage } from "@/components/Toast";

function StepShell({ eyebrow, title, subtitle, children }: { eyebrow?: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      {eyebrow && (
        <div className="cl-mono" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: C.accentLight, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
          {eyebrow}
        </div>
      )}
      <h1 className="cl-display" style={{ fontSize: 27, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.25 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 13.5, color: C.accentLight, margin: "0 0 24px" }}>{subtitle}</p>}
      <div style={{ textAlign: "left" }}>{children}</div>
    </div>
  );
}

const STEPS = ["Energy", "Wins", "Improve", "Content", "Outreach", "Roadblock", "Wrap up"];

export default function WeeklyCheckInWizard({
  clientId,
  editingLog,
  onClose,
}: {
  clientId: string;
  editingLog: WeeklyLog | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const weekKey = editingLog ? editingLog.weekOf : getWeekKey();
  const [step, setStep] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchKPIData(createClient(), clientId);
        setCampaigns(data.campaigns);
      } catch (err) {
        showToast(toastMessage(err, "Couldn't load your campaigns — try reopening the check-in."));
      }
    })();
  }, [clientId]);

  const [campaignEntries, setCampaignEntries] = useState<WeeklyLogFormEntry[]>(() => {
    const base = campaigns.map((c) => {
      const existing = editingLog?.campaignEntries?.find((e) => e.campaignBrand === c.brand);
      return existing ? { ...existing } : { campaignBrand: c.brand, videosFilmed: "", amountEarned: "", bonusEarned: "" };
    });
    const extra = (editingLog?.campaignEntries || []).filter((e) => !campaigns.some((c) => c.brand === e.campaignBrand));
    return [...base, ...extra];
  });
  // Re-seed once campaigns finish loading (initial state above runs before the fetch resolves).
  useEffect(() => {
    if (campaigns.length === 0) return;
    setCampaignEntries((prev) => {
      if (prev.length > 0) return prev;
      const base = campaigns.map((c) => {
        const existing = editingLog?.campaignEntries?.find((e) => e.campaignBrand === c.brand);
        return existing ? { ...existing } : { campaignBrand: c.brand, videosFilmed: "", amountEarned: "", bonusEarned: "" };
      });
      const extra = (editingLog?.campaignEntries || []).filter((e) => !campaigns.some((c) => c.brand === e.campaignBrand));
      return [...base, ...extra];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns.length]);

  const [ugcOneOff, setUgcOneOff] = useState<string | number>(editingLog?.ugcOneOff ?? "");
  const [energyLevel, setEnergyLevel] = useState<number | null>(editingLog?.energyLevel ?? null);
  const [wentWell, setWentWell] = useState(editingLog?.wentWell || "");
  const [couldImprove, setCouldImprove] = useState(editingLog?.couldImprove || "");
  const [deepWorkHours, setDeepWorkHours] = useState<string | number>(editingLog?.deepWorkHours ?? "");
  const [outreachSent, setOutreachSent] = useState<string | number>(editingLog?.outreachSent ?? "");
  const [outreachFollowUps, setOutreachFollowUps] = useState<string | number>(editingLog?.outreachFollowUps ?? "");
  const [dealsClosed, setDealsClosed] = useState<string | number>(editingLog?.dealsClosed ?? "");
  const [roadblock, setRoadblock] = useState(editingLog?.roadblock || "");
  const [roadblockAction, setRoadblockAction] = useState(editingLog?.roadblockAction || "");
  const [gratitude, setGratitude] = useState(editingLog?.gratitude || "");
  const [nextWeekTasks, setNextWeekTasks] = useState(editingLog?.nextWeekTasks || "");
  const [saving, setSaving] = useState(false);

  function updateRow(i: number, field: keyof WeeklyLogFormEntry, value: string) {
    setCampaignEntries((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  const isLast = step === STEPS.length - 1;

  async function finish() {
    setSaving(true);
    try {
      await saveWeeklyLog(createClient(), clientId, weekKey, editingLog?.id || null, {
        campaignEntries,
        ugcOneOff,
        energyLevel,
        wentWell,
        couldImprove,
        deepWorkHours,
        outreachSent,
        outreachFollowUps,
        dealsClosed,
        roadblock,
        roadblockAction,
        gratitude,
        nextWeekTasks,
      });
      onClose();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save your check-in — try again."));
    } finally {
      setSaving(false);
    }
  }

  const wizardInput = { ...inputStyle, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", fontSize: 14 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,5,5,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }} className="cl-scroll">
        <button onClick={onClose} style={{ position: "fixed", top: 20, right: 24, background: "none", border: "none", color: C.textFaint, cursor: "pointer", zIndex: 5 }}>
          <X size={20} />
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18 }}>
          <Logo size={20} />
          <span className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: C.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Creator Launchpad</span>
        </div>
        <div style={{ height: 3, background: C.surface3, borderRadius: 2, marginBottom: 32, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`, background: C.accent, borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>

        {step === 0 && (
          <StepShell eyebrow={<><Star size={13} fill={C.accentLight} color={C.accentLight} /> Weekly check-in</>} title="How's your energy this week?" subtitle="This is the main thing your coach checks every week.">
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setEnergyLevel(n)}
                  className="cl-mono"
                  style={{ width: 38, height: 38, borderRadius: "50%", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${energyLevel === n ? C.accent : C.border}`, background: energyLevel === n ? C.accent : C.surface2, color: energyLevel === n ? "#fff" : C.textMuted }}
                >
                  {n}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="What went well this week?" subtitle="Brag a little — it's been logged for a reason.">
            <textarea style={{ ...wizardInput, minHeight: 100, resize: "vertical", width: "100%" }} value={wentWell} onChange={(e) => setWentWell(e.target.value)} placeholder="Scripted, filmed, edited, and posted..." />
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="What could've been better?" subtitle="No judgment — just the honest version.">
            <textarea style={{ ...wizardInput, minHeight: 100, resize: "vertical", width: "100%" }} value={couldImprove} onChange={(e) => setCouldImprove(e.target.value)} placeholder="Spent less time out and more heads-down..." />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="How much did you film — and earn?" subtitle="This is what actually drives your KPI numbers.">
            <Field label="Deep work (hours)">
              <input style={wizardInput} type="number" value={deepWorkHours} onChange={(e) => setDeepWorkHours(e.target.value)} placeholder="0" />
            </Field>
            {campaignEntries.map((row, i) => {
              const campaign = campaigns.find((c) => c.brand === row.campaignBrand);
              const hasBonusTiers = !!campaign && campaign.bonusTiers.length > 0;
              return (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.accentLight, marginBottom: 8 }}>{row.campaignBrand}</div>
                  <div style={{ display: "grid", gridTemplateColumns: hasBonusTiers ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                    <Field label="Videos filmed">
                      <input style={wizardInput} type="number" value={row.videosFilmed} onChange={(e) => updateRow(i, "videosFilmed", e.target.value)} placeholder="0" />
                    </Field>
                    <Field label="Amount earned ($)">
                      <input style={wizardInput} type="number" value={row.amountEarned} onChange={(e) => updateRow(i, "amountEarned", e.target.value)} placeholder="0" />
                    </Field>
                    {hasBonusTiers && (
                      <Field label="View bonus ($)">
                        <input style={wizardInput} type="number" value={row.bonusEarned} onChange={(e) => updateRow(i, "bonusEarned", e.target.value)} placeholder="0" />
                      </Field>
                    )}
                  </div>
                </div>
              );
            })}
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="How's your outreach going?" subtitle="Feeds straight into your UGC KPI funnel.">
            <Field label="UGC one-off deals collected this week ($)">
              <input style={wizardInput} type="number" value={ugcOneOff} onChange={(e) => setUgcOneOff(e.target.value)} placeholder="0" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <Field label="Brands pitched">
                <input style={wizardInput} type="number" value={outreachSent} onChange={(e) => setOutreachSent(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Followed up">
                <input style={wizardInput} type="number" value={outreachFollowUps} onChange={(e) => setOutreachFollowUps(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Deals closed">
                <input style={wizardInput} type="number" value={dealsClosed} onChange={(e) => setDealsClosed(e.target.value)} placeholder="0" />
              </Field>
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="What's your biggest roadblock?" subtitle="And what are you doing about it?">
            <Field label="Biggest roadblock">
              <textarea style={{ ...wizardInput, minHeight: 70, resize: "vertical", width: "100%" }} value={roadblock} onChange={(e) => setRoadblock(e.target.value)} placeholder="Currently kinda bored, idk..." />
            </Field>
            <Field label="How are you combating it?">
              <textarea style={{ ...wizardInput, minHeight: 70, resize: "vertical", width: "100%" }} value={roadblockAction} onChange={(e) => setRoadblockAction(e.target.value)} placeholder="Just power through the work..." />
            </Field>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell title="What are you proud of — and what's next?" subtitle="Close it out and lock in next week.">
            <Field label="Grateful / proud of">
              <textarea style={{ ...wizardInput, minHeight: 70, resize: "vertical", width: "100%" }} value={gratitude} onChange={(e) => setGratitude(e.target.value)} placeholder="Hit 400K views on a personal video..." />
            </Field>
            <Field label="Tasks for next week">
              <textarea style={{ ...wizardInput, minHeight: 70, resize: "vertical", width: "100%" }} value={nextWeekTasks} onChange={(e) => setNextWeekTasks(e.target.value)} placeholder="Post more, outreach more..." />
            </Field>
          </StepShell>
        )}

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 28 }}>
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} style={{ padding: "12px 28px", borderRadius: 30, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.text, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            disabled={(step === 0 && energyLevel === null) || saving}
            style={{
              padding: "12px 32px", borderRadius: 30, border: "none", cursor: step === 0 && energyLevel === null ? "not-allowed" : "pointer",
              background: step === 0 && energyLevel === null ? C.surface3 : C.accent,
              color: step === 0 && energyLevel === null ? C.textFaint : "#fff",
              fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {isLast ? (saving ? "Submitting..." : "Submit check-in") : "Next"} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
