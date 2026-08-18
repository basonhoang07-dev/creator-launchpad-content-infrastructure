"use client";

// app/(dashboard)/page.tsx — Home
//
// Ported from the prototype's HomePage. Field-name changes only where the
// data source changed (session.role -> profile.role, data.calendar -> a
// per-client Supabase fetch, setActive("x") -> router.push("/x")). Business
// logic (goal math, streaks, Needs-You-Now aggregation, scripting pace gaps)
// is unchanged.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Star, Film, AlertCircle, FileText, Clock, Target, MessageSquare, ChevronRight, ChevronDown,
  CircleDot, Pencil, Wallet, CalendarDays, X,
} from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, SectionHeader, SlateDivider, EmptyState, Modal } from "@/components/ui";
import { ProgressRing, TrendChart, DonutChart, LeaderboardBars, DONUT_PALETTE } from "@/components/charts";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { fetchHomeData, type HomeData } from "@/lib/queries/home";
import { fetchCommunityOverview, type CommunityData } from "@/lib/queries/community";
import { todayPlus, getWeekKey, formatWeekLabel, isSameMonth, isWeekActuallyLogged, monthlyIncomeHistory, parseDateOnly, type WeeklyLog } from "@/lib/helpers";
import CommunityOverview from "@/components/CommunityOverview";
import WeeklyCheckInWizard from "@/components/WeeklyCheckInWizard";
import CheckInDetailModal from "@/components/CheckInDetailModal";

export default function HomePage() {
  const { profile } = useSession();
  const clientId = useDefaultScopedClientId();
  const router = useRouter();

  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    if (clientId) {
      // Only show the full-page "Loading…" state on the very first fetch — a
      // background refresh (e.g. tab refocus, see below) shouldn't blank out
      // data the user is already looking at.
      setLoading(!homeData);
      const data = await fetchHomeData(supabase, clientId);
      setHomeData(data);
      setLoading(false);
    }
    if (profile.role === "Admin") {
      const data = await fetchCommunityOverview(supabase, profile.organization_id);
      setCommunity(data);
    }
  }, [clientId, profile.role, profile.organization_id, homeData]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, profile.role, profile.organization_id]);

  // Client components fetch once on mount, but Next's client-side router
  // cache can keep this page's instance alive (and its data un-refetched)
  // when you navigate away and back within ~30s — and nothing here re-fetches
  // when another session (an editor logging a view, you working in Admin
  // Panel) changes the data this page shows. Re-fetch whenever the tab comes
  // back into focus so "Home" doesn't look stale until a hard refresh.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const [editingLog, setEditingLog] = useState<WeeklyLog | null>(null);
  const [needsNowCollapsed, setNeedsNowCollapsed] = useState(false);
  const [dismissedNeedsItems, setDismissedNeedsItems] = useState<string[]>([]);
  const [showLogHistory, setShowLogHistory] = useState(false);
  const [viewingLog, setViewingLog] = useState<WeeklyLog | null>(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showReminder, setShowReminder] = useState(false);

  const currentWeekKey = getWeekKey();
  const thisWeekLog = homeData?.weeklyLogs.find((l) => l.weekOf === currentWeekKey) || null;

  useEffect(() => {
    if (profile.role === "Client" && homeData && !isWeekActuallyLogged(thisWeekLog)) {
      setShowReminder(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!homeData]);

  function goToBrand(brand: string, view: string) {
    router.push(`/calendar?brand=${encodeURIComponent(brand)}&view=${view}`);
  }

  if (profile.role === "Creative Director" && !clientId) {
    return (
      <EmptyState
        icon={CalendarDays}
        text='Pick a client from "Working in" in the sidebar to see their Home dashboard.'
      />
    );
  }

  if (loading || !homeData) {
    return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;
  }

  const data = homeData;
  const unscheduled = data.calendar.filter((c) => !c.date);
  const soon = todayPlus(7);
  const urgentUnscripted = data.calendar
    .filter((c) => c.date && c.date <= soon && c.date >= todayPlus(0) && (!c.script || !c.script.trim()))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const monthLogs = data.weeklyLogs.filter((l) => isSameMonth(l.weekOf));
  const cashThisMonth = monthLogs.reduce((sum, l) => {
    const campaignSum = l.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0);
    return sum + campaignSum + (l.ugcOneOff || 0);
  }, 0);
  const videosThisWeek = thisWeekLog ? thisWeekLog.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0) : 0;
  const cashThisWeek = thisWeekLog
    ? thisWeekLog.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0) + (thisWeekLog.ugcOneOff || 0)
    : 0;

  const retainerMax = data.retainerCampaigns.reduce((sum, c) => sum + c.rate * c.maxPosts * 30, 0);
  const monthlyGoal = retainerMax + (data.client.ugcKpiGoal || 0);
  const goalPct = monthlyGoal > 0 ? (cashThisMonth / monthlyGoal) * 100 : 0;
  const weeklyTargetVideos = data.retainerCampaigns.reduce((sum, c) => sum + c.maxPosts, 0) * 7;

  const goalStatus =
    goalPct >= 100 ? { label: "Hit goal", tone: "success" as const } : goalPct >= 70 ? { label: "On track", tone: "accent" as const } : { label: "Behind", tone: "warning" as const };

  const sortedLogs = [...data.weeklyLogs].sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  let filmingStreak = 0;
  if (weeklyTargetVideos > 0) {
    for (const log of sortedLogs) {
      const videos = log.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0);
      if (videos >= weeklyTargetVideos) filmingStreak++;
      else break;
    }
  }
  const justHitGoal = goalPct >= 100;

  const scriptingPaceGaps = data.brands
    .map((brand) => {
      const dailyVolume = data.retainerCampaigns.filter((c) => c.brand === brand).reduce((s, c) => s + (Number(c.maxPosts) || 0), 0);
      if (!dailyVolume) return null;
      const readyBuffer = data.calendar.filter((c) => c.brand === brand && !c.date && (c.status || "Unscripted") !== "Unscripted").length;
      if (readyBuffer >= dailyVolume) return null;
      return { brand, dailyVolume, readyBuffer };
    })
    .filter(Boolean) as { brand: string; dailyVolume: number; readyBuffer: number }[];

  const needsItems: { icon: any; star?: boolean; title: string; sub: string; action: string; onClick: () => void }[] = [];
  if (profile.role === "Client" && !isWeekActuallyLogged(thisWeekLog)) {
    needsItems.push({
      icon: Star,
      star: true,
      title: "Weekly check-in",
      sub: `Week of ${formatWeekLabel(currentWeekKey)} — your main focus this week`,
      action: "Start",
      onClick: () => setShowCheckIn(true),
    });
  }
  const missingScriptsByBrand: Record<string, typeof urgentUnscripted> = {};
  urgentUnscripted.forEach((c) => {
    missingScriptsByBrand[c.brand] = missingScriptsByBrand[c.brand] || [];
    missingScriptsByBrand[c.brand].push(c);
  });
  Object.entries(missingScriptsByBrand).forEach(([brand, items]) => {
    const daysAway = Math.max(0, Math.round((new Date(items[0].date!).getTime() - new Date(todayPlus(0)).getTime()) / 86400000));
    needsItems.push({
      icon: AlertCircle,
      title: `${brand}: ${items.length} script${items.length > 1 ? "s" : ""} needed ASAP`,
      sub: daysAway === 0 ? "Filming today — none written yet" : `Soonest films in ${daysAway} day${daysAway > 1 ? "s" : ""}`,
      action: "Go to board",
      onClick: () => goToBrand(brand, "table"),
    });
  });
  scriptingPaceGaps.forEach((g) => {
    needsItems.push({
      icon: FileText,
      title: `Scripting behind pace for ${g.brand}`,
      sub: `${g.readyBuffer} ready, needs ~${g.dailyVolume}/day buffer`,
      action: "Go to board",
      onClick: () => goToBrand(g.brand, "table"),
    });
  });
  if (unscheduled.length > 0) {
    needsItems.push({
      icon: Clock,
      title: `${unscheduled.length} concept${unscheduled.length > 1 ? "s" : ""} unscheduled`,
      sub: "Waiting for the next auto-schedule batch",
      action: "Open",
      onClick: () => router.push("/calendar"),
    });
  }
  if (profile.role === "Client") {
    data.retainerCampaigns
      .filter((c) => !c.rate && !c.maxPosts)
      .forEach((c) => {
        needsItems.push({
          icon: Target,
          title: `Set a KPI goal for ${c.brand}`,
          sub: "New board — rate & daily volume not set yet",
          action: "Set up",
          onClick: () => router.push("/kpi"),
        });
      });
  }
  data.recaps.forEach((r) => {
    const pending = r.actionItems.filter((i) => !i.done);
    if (pending.length === 0) return;
    needsItems.push({
      icon: MessageSquare,
      title: `${pending.length} action item${pending.length > 1 ? "s" : ""} from "${r.title}"`,
      sub: `From your ${parseDateOnly(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} call`,
      action: "Open recap",
      onClick: () => router.push("/recaps"),
    });
  });
  const visibleNeedsItems = needsItems.filter((item) => !dismissedNeedsItems.includes(item.title));

  return (
    <div>
      {profile.role === "Admin" && community && <CommunityOverview community={community} />}

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: C.accentLight, marginBottom: 6, textTransform: "uppercase" }}>
              {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h1 className="cl-display" style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>
                Welcome back, {profile.name.split(" ")[0]}
              </h1>
            </div>
          </div>
          {profile.role === "Client" && (
            <Button onClick={() => setShowCheckIn(true)} variant={isWeekActuallyLogged(thisWeekLog) ? "secondary" : "primary"} style={{ flexShrink: 0 }}>
              {isWeekActuallyLogged(thisWeekLog) ? <Check size={15} /> : <Star size={15} fill="#fff" />}
              Weekly Check-In {isWeekActuallyLogged(thisWeekLog) ? "· Done" : ""}
            </Button>
          )}
        </div>
        {profile.role === "Client" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
              <span className="cl-mono" style={{ fontSize: 26, fontWeight: 700, color: C.accentLight }}>
                ${cashThisMonth.toLocaleString()}
              </span>
              <span style={{ fontSize: 16, color: C.textFaint }}>/ ${monthlyGoal.toLocaleString()} collected this month</span>
              <Badge tone={goalStatus.tone}>{goalStatus.label}</Badge>
            </div>
            <div style={{ width: "100%", maxWidth: 480, height: 6, background: C.surface3, borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, goalPct)}%`, height: "100%", background: C.accent, borderRadius: 4, transition: "width 0.4s ease" }} />
            </div>
          </>
        )}
        <SlateDivider style={{ marginTop: 16, borderRadius: 2, overflow: "hidden", width: 140 }} />
      </div>

      {(profile.role === "Client" || profile.role === "VA/Editor" || profile.role === "Creative Director") &&
        (() => {
          const todayStr = todayPlus(0);
          const filmingToday = data.calendar.filter((c) => c.date === todayStr && (profile.role !== "VA/Editor" || c.editorProfileId === profile.id));
          const weekLogged = isWeekActuallyLogged(thisWeekLog);
          const nothingDue = filmingToday.length === 0 && urgentUnscripted.length === 0 && (profile.role !== "Client" || weekLogged);

          const filmingByBrand: Record<string, typeof filmingToday> = {};
          filmingToday.forEach((c) => {
            filmingByBrand[c.brand] = filmingByBrand[c.brand] || [];
            filmingByBrand[c.brand].push(c);
          });
          const scriptingByBrand: Record<string, typeof urgentUnscripted> = {};
          urgentUnscripted.forEach((c) => {
            scriptingByBrand[c.brand] = scriptingByBrand[c.brand] || [];
            scriptingByBrand[c.brand].push(c);
          });

          return (
            <Card style={{ marginBottom: 16, border: `1px solid ${nothingDue ? C.border : C.accent}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, textTransform: "uppercase", fontWeight: 700 }}>
                  Today · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </div>
                {nothingDue && <Badge tone="success">All clear</Badge>}
              </div>
              {nothingDue ? (
                <div style={{ fontSize: 13, color: C.textMuted }}>Nothing due today — you're clear.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {Object.entries(filmingByBrand).map(([brand, items]) => (
                    <div key={brand} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 8, padding: "8px 12px" }}>
                      <Film size={14} color={C.accentLight} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{brand}</span>
                      <Badge tone="accent">{items.length} due today</Badge>
                      <Button size="sm" variant="secondary" onClick={() => goToBrand(brand, "calendar")}>
                        Go to board
                      </Button>
                    </div>
                  ))}
                  {Object.entries(scriptingByBrand).map(([brand, items]) => (
                    <div key={brand} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 8, padding: "8px 12px" }}>
                      <AlertCircle size={14} color={C.warning} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{brand}</span>
                      <Badge tone="warning">
                        {items.length} script{items.length > 1 ? "s" : ""} needed ASAP
                      </Badge>
                      <Button size="sm" variant="secondary" onClick={() => goToBrand(brand, "table")}>
                        Go to board
                      </Button>
                    </div>
                  ))}
                  {profile.role === "Client" && !weekLogged && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 8, padding: "8px 12px" }}>
                      <Star size={14} color={C.accentLight} fill={C.accentLight} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, flex: 1 }}>Weekly check-in — your main focus</span>
                      <Button size="sm" onClick={() => setShowCheckIn(true)}>
                        Start
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })()}

      {profile.role === "Client" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.2fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Videos filmed</div>
            <div className="cl-display" style={{ fontSize: 34, fontWeight: 700 }}>
              {videosThisWeek}
            </div>
            <div className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>
              target {weeklyTargetVideos}/wk
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Cash this week</div>
            <div className="cl-display" style={{ fontSize: 34, fontWeight: 700 }}>
              ${cashThisWeek.toLocaleString()}
            </div>
            <div className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>
              {thisWeekLog ? "logged" : "not logged"}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Avg $ / video</div>
            <div className="cl-display" style={{ fontSize: 34, fontWeight: 700 }}>
              ${videosThisWeek ? Math.round(cashThisWeek / videosThisWeek) : 0}
            </div>
            <div className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>
              this week
            </div>
          </Card>
          <Card style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ProgressRing pct={goalPct} size={92} sublabel="of goal" />
            <div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Monthly goal</div>
              <Badge tone={goalStatus.tone}>{goalStatus.label}</Badge>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 8, lineHeight: 1.4 }}>
                ${cashThisMonth.toLocaleString()} of ${monthlyGoal.toLocaleString()}
              </div>
            </div>
          </Card>
        </div>
      )}

      {profile.role === "Client" && data.weeklyLogs.length > 1 && (
        <Card style={{ marginBottom: 16 }}>
          <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
            Your income trend
          </div>
          <TrendChart points={monthlyIncomeHistory(data.weeklyLogs)} maxWidth={900} />
        </Card>
      )}

      {profile.role === "Client" &&
        (() => {
          const monthLogsForBrands = data.weeklyLogs.filter((l) => isSameMonth(l.weekOf));
          const brandEarnings = data.brands.map((brand, i) => {
            const earned = monthLogsForBrands.reduce((sum, l) => {
              const entry = l.campaignEntries.find((e) => e.campaignBrand === brand);
              return sum + (entry ? (entry.amountEarned || 0) + (entry.bonusEarned || 0) : 0);
            }, 0);
            return { id: brand, name: brand, contractedCash: earned, otherEarnings: 0, color: DONUT_PALETTE[i % DONUT_PALETTE.length] };
          });
          const ugcThisMonth = monthLogsForBrands.reduce((sum, l) => sum + (l.ugcOneOff || 0), 0);
          if (ugcThisMonth > 0)
            brandEarnings.push({ id: "ugc-oneoff", name: "One-off deals", contractedCash: ugcThisMonth, otherEarnings: 0, color: DONUT_PALETTE[brandEarnings.length % DONUT_PALETTE.length] });
          const active = brandEarnings.filter((b) => b.contractedCash > 0).sort((a, b) => b.contractedCash - a.contractedCash);

          if (active.length === 0) return null;
          return (
            <Card style={{ marginBottom: 16 }}>
              <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>
                This month by brand
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 600, marginBottom: 10 }}>Who's earning you the most</div>
                  <LeaderboardBars clients={active} />
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 600, marginBottom: 10 }}>Income mix</div>
                  <DonutChart segments={active.map((b) => ({ label: b.name, value: b.contractedCash, color: b.color }))} size={130} />
                </div>
              </div>
            </Card>
          );
        })()}

      {profile.role === "Client" && (justHitGoal || filmingStreak >= 2) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {justHitGoal && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(61,220,132,0.12)", border: `1px solid ${C.success}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.text }}>
              <span style={{ fontSize: 16 }}>🎉</span> Goal hit for {new Date().toLocaleDateString(undefined, { month: "long" })} — great month.
            </div>
          )}
          {filmingStreak >= 2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.text }}>
              <span style={{ fontSize: 16 }}>🔥</span> {filmingStreak}-week filming streak — hitting your target every week.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <button
            onClick={() => setNeedsNowCollapsed((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: needsNowCollapsed ? 0 : 14 }}
          >
            {needsNowCollapsed ? <ChevronRight size={13} color={C.textFaint} /> : <ChevronDown size={13} color={C.textFaint} />}
            <span className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.textMuted, textTransform: "uppercase", fontWeight: 700 }}>
              Needs you now
            </span>
            {visibleNeedsItems.length > 0 && (
              <span className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint }}>
                ({visibleNeedsItems.length})
              </span>
            )}
          </button>
          {!needsNowCollapsed && (
            <div style={{ display: "grid", gap: 10 }}>
              {visibleNeedsItems.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: item.star ? C.accentDim : C.surface2, border: `1px solid ${item.star ? C.accent : C.border}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: item.star ? C.accent : C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={16} color={item.star ? "#fff" : C.accentLight} fill={item.star ? "#fff" : "none"} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: 11.5, color: C.textMuted }}>{item.sub}</div>
                    </div>
                    <Button size="sm" onClick={item.onClick}>
                      {item.action}
                    </Button>
                    {!item.star && (
                      <button
                        onClick={() => setDismissedNeedsItems((prev) => [...prev, item.title])}
                        title="Hide this"
                        style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: 2, flexShrink: 0 }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {visibleNeedsItems.length === 0 && (
                <div style={{ fontSize: 13, color: C.textFaint, padding: "20px 4px", textAlign: "center" }}>All caught up — nothing needs your attention right now.</div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.textMuted, marginBottom: 14, textTransform: "uppercase", fontWeight: 700 }}>
            Systems
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              { label: "Google Drive", value: data.integrations.find((i) => i.id === "drive")?.connected ? "Live" : "Off", tone: data.integrations.find((i) => i.id === "drive")?.connected ? C.success : C.textFaint },
              { label: "Cash vs goal", value: `$${cashThisMonth.toLocaleString()}`, tone: C.accentLight },
              { label: "Videos filmed this week", value: String(videosThisWeek), tone: C.text },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CircleDot size={10} color={row.tone} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.textMuted, flex: 1 }}>{row.label}</span>
                <span className="cl-mono" style={{ fontSize: 13, fontWeight: 600, color: row.tone }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionHeader
          eyebrow="This week"
          title="Up next on the calendar"
          action={
            data.weeklyLogs.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setShowLogHistory(true)}>
                <Pencil size={13} /> Log history ({data.weeklyLogs.length})
              </Button>
            )
          }
        />
        <div style={{ display: "grid", gap: 10 }}>
          {data.calendar
            .filter((c) => c.date)
            .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
            .slice(0, 4)
            .map((c) => (
              <Card key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Film size={17} color={C.accentLight} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>
                    {c.brand} · {c.format}
                  </div>
                </div>
                <Badge>{c.date}</Badge>
              </Card>
            ))}
          {data.calendar.filter((c) => c.date).length === 0 && <EmptyState icon={CalendarDays} text="Nothing scheduled yet — head to Content Calendar." />}
        </div>
      </div>

      {showCheckIn && (
        <WeeklyCheckInWizard
          clientId={data.client.id}
          editingLog={editingLog || thisWeekLog}
          onClose={() => {
            setShowCheckIn(false);
            setEditingLog(null);
            reload();
          }}
        />
      )}

      {showLogHistory && (
        <Modal title="Weekly log history" onClose={() => setShowLogHistory(false)} width={520}>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>
            Every logged week, most recent first. View the full check-in, or edit the numbers if something was wrong.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[...data.weeklyLogs]
              .sort((a, b) => b.weekOf.localeCompare(a.weekOf))
              .map((log) => {
                const cash = log.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0) + (log.ugcOneOff || 0);
                const videos = log.campaignEntries.reduce((s, e) => s + (e.videosFilmed || 0), 0);
                return (
                  <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface2, borderRadius: 10, padding: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Week of {formatWeekLabel(log.weekOf)}</div>
                      <div className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
                        {videos} videos · ${cash.toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setViewingLog(log);
                        setShowLogHistory(false);
                      }}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingLog(log);
                        setShowLogHistory(false);
                        setShowCheckIn(true);
                      }}
                    >
                      <Pencil size={12} /> Edit
                    </Button>
                  </div>
                );
              })}
            {data.weeklyLogs.length === 0 && <EmptyState icon={Wallet} text="No weeks logged yet." />}
          </div>
        </Modal>
      )}

      {viewingLog && <CheckInDetailModal log={viewingLog} onClose={() => setViewingLog(null)} />}

      {showReminder && (
        <Modal title="👋 Weekly check-in reminder" onClose={() => setShowReminder(false)} width={400}>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, marginBottom: 18 }}>
            You haven't logged the week of <b>{formatWeekLabel(currentWeekKey)}</b> yet. Takes a couple minutes — energy, wins, roadblocks, and this week's numbers.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setShowReminder(false)}>
              Remind me later
            </Button>
            <Button
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => {
                setShowReminder(false);
                setShowCheckIn(true);
              }}
            >
              <Star size={14} fill="#fff" /> Start now
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
