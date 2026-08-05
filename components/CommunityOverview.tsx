"use client";

// components/CommunityOverview.tsx
//
// Ported from the prototype's CommunityOverview, with one change: `community`
// is now computed live from real weekly_logs/retainer_campaigns/clients
// (lib/queries/community.ts) instead of the prototype's hand-maintained
// `data.community` mock, per the "compute from real data" decision.

import React, { useState } from "react";
import { TrendingUp, Users } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, EmptyState } from "@/components/ui";
import { TrendChart, DonutChart, LeaderboardBars, DONUT_PALETTE } from "@/components/charts";
import type { CommunityData } from "@/lib/queries/community";

const STATUS_TONE: Record<string, "success" | "accent" | "warning"> = { Ahead: "success", "On track": "accent", Behind: "warning" };

export default function CommunityOverview({ community }: { community: CommunityData }) {
  const [revenueView, setRevenueView] = useState<"collected" | "revenue">("collected");
  const history = community?.monthlyHistory || [];
  const clients = community?.clients || [];
  const currentTotal = history.length ? history[history.length - 1].total : 0;
  const priorTotal = history.length > 1 ? history[history.length - 2].total : currentTotal;
  const momGrowth = priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : 0;
  const firstTotal = history.length ? history[0].total : currentTotal;
  const sinceStartGrowth = firstTotal > 0 ? ((currentTotal - firstTotal) / firstTotal) * 100 : 0;
  const revenueTotal = clients.reduce((s, c) => s + (c.monthlyGoal || 0), 0);

  const sortedClients = [...clients].sort((a, b) => b.contractedCash + b.otherEarnings - (a.contractedCash + a.otherEarnings));
  const sortedByGoal = [...clients].sort((a, b) => (b.monthlyGoal || 0) - (a.monthlyGoal || 0));

  const TOP_N = 4;
  const top = sortedClients.slice(0, TOP_N);
  const rest = sortedClients.slice(TOP_N);
  const restTotal = rest.reduce((s, c) => s + c.contractedCash + c.otherEarnings, 0);
  const donutSegments = [
    ...top.map((c, i) => ({ label: c.name, value: c.contractedCash + c.otherEarnings, color: DONUT_PALETTE[i] })),
    ...(restTotal > 0 ? [{ label: `Other clients (${rest.length})`, value: restTotal, color: DONUT_PALETTE[TOP_N] }] : []),
  ];

  return (
    <>
      <Card style={{ marginBottom: 16, background: `linear-gradient(160deg, ${C.accentDim}, ${C.surface})` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, textTransform: "uppercase", fontWeight: 700 }}>
            Community earnings · Admin only
          </div>
          {revenueView === "collected" && sinceStartGrowth !== 0 && (
            <span className="cl-mono" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.success, background: "rgba(61,220,132,0.14)", padding: "3px 9px", borderRadius: 20, fontWeight: 700 }}>
              <TrendingUp size={11} /> +{sinceStartGrowth.toFixed(0)}% since {history[0]?.month}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10, marginBottom: 6 }}>
          <button
            onClick={() => setRevenueView("collected")}
            style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${revenueView === "collected" ? C.accent : C.border}`, background: revenueView === "collected" ? C.accent : "transparent", color: revenueView === "collected" ? "#fff" : C.textMuted }}
          >
            Cash collected
          </button>
          <button
            onClick={() => setRevenueView("revenue")}
            style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${revenueView === "revenue" ? C.accent : C.border}`, background: revenueView === "revenue" ? C.accent : "transparent", color: revenueView === "revenue" ? "#fff" : C.textMuted }}
          >
            Revenue
          </button>
        </div>

        {revenueView === "collected" ? (
          <>
            <div className="cl-display" style={{ fontSize: 40, fontWeight: 700, marginTop: 6 }}>
              ${currentTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 2 }}>
              total earned across every client this cycle
              {momGrowth !== 0 && (
                <span style={{ color: momGrowth >= 0 ? C.success : C.danger, marginLeft: 8 }}>
                  {momGrowth >= 0 ? "▲" : "▼"} {Math.abs(momGrowth).toFixed(1)}% vs last month
                </span>
              )}
            </div>
            {history.length > 1 && (
              <div style={{ marginTop: 18, marginBottom: 6, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: "2 1 480px", minWidth: 0 }}>
                  <TrendChart points={history} maxWidth={1400} />
                </div>
                {sortedClients.length > 0 && (
                  <div style={{ flex: "1 1 220px" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textMuted, marginBottom: 10 }}>Share of community earnings</div>
                    <DonutChart segments={donutSegments} size={150} />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="cl-display" style={{ fontSize: 40, fontWeight: 700, marginTop: 6, color: C.accentLight }}>
              ${revenueTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 2 }}>combined monthly goal across every client</div>
            <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
              {sortedByGoal.map((c) => {
                const pct = revenueTotal > 0 ? ((c.monthlyGoal || 0) / revenueTotal) * 100 : 0;
                return (
                  <div key={c.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: C.text, fontWeight: 600 }}>{c.name}</span>
                      <span className="cl-mono" style={{ color: C.accentLight, fontWeight: 700 }}>
                        ${(c.monthlyGoal || 0).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: C.surface3, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: C.accentLight, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
              {sortedByGoal.length === 0 && <div style={{ fontSize: 12.5, color: C.textFaint }}>No clients yet.</div>}
            </div>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.textMuted, textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>
          Per-client breakdown
        </div>

        {sortedClients.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 12 }}>Top earners — this month</div>
            <LeaderboardBars clients={sortedClients.slice(0, 6)} />
          </div>
        )}

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 10 }}>Client leaderboard — full detail</div>
          <div style={{ display: "grid", gap: 8 }}>
            {sortedClients.map((c, i) => {
              const total = c.contractedCash + c.otherEarnings;
              const goalPct = c.monthlyGoal > 0 ? Math.min(100, (total / c.monthlyGoal) * 100) : 0;
              return (
                <div key={c.id} style={{ background: C.surface2, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="cl-mono" style={{ fontSize: 11, color: C.textFaint, width: 16, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {c.name.slice(0, 1)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                      <div className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint }}>
                        ${c.contractedCash.toLocaleString()} contracted · ${c.otherEarnings.toLocaleString()} other
                      </div>
                    </div>
                    <span className="cl-mono" style={{ fontSize: 14, fontWeight: 700 }}>
                      ${total.toLocaleString()}
                    </span>
                    <Badge tone={STATUS_TONE[c.status] || "default"}>{c.status}</Badge>
                  </div>
                  {c.monthlyGoal > 0 && (
                    <div style={{ marginTop: 10, paddingLeft: 40 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.textFaint, marginBottom: 4 }}>
                        <span>
                          {Math.round(goalPct)}% of ${c.monthlyGoal.toLocaleString()} goal
                        </span>
                        <span>
                          {c.videosFilmed || 0} videos · {c.dealsClosed || 0} deals closed
                        </span>
                      </div>
                      <div style={{ width: "100%", height: 5, background: C.surface3, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${goalPct}%`, height: "100%", background: goalPct >= 100 ? C.success : C.accent, borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {sortedClients.length === 0 && <EmptyState icon={Users} text="No client earnings recorded yet." />}
          </div>
        </div>
      </Card>
    </>
  );
}
