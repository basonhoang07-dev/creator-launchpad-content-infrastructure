"use client";

// app/(dashboard)/leaderboard/page.tsx — Leaderboard
//
// Client + Admin only, same audience as KPI Trackers (see Sidebar's
// `seesFinancials`). Shows this month's cash collected vs. projected cash
// (the monthly goal) across every client in the org, ranked. Data comes from
// /api/leaderboard, not a direct Supabase query — weekly_logs is RLS-locked
// per client, and that route is what safely computes the cross-client
// numbers server-side without exposing any client's private check-in
// fields (energy, roadblocks, etc.) to the others.

import React, { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, SectionHeader, EmptyState } from "@/components/ui";
import { useSession } from "@/components/SessionProvider";
import { useToast, toastMessage } from "@/components/Toast";

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  cashCollected: number;
  projectedCash: number;
}

export default function LeaderboardPage() {
  const { profile } = useSession();

  if (profile.role !== "Client" && profile.role !== "Admin") {
    return <EmptyState icon={Trophy} text="Leaderboard is only available to Client and Admin accounts." />;
  }

  return <LeaderboardInner />;
}

function LeaderboardInner() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load the leaderboard.");
      setEntries(json.entries);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't load the leaderboard — try refreshing."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
  }, [reload]);

  return (
    <div>
      <SectionHeader
        eyebrow={new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        title="Leaderboard"
      />

      {!entries ? (
        <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={Trophy} text="No clients on the roster yet." />
      ) : (
        <Card>
          <div style={{ display: "grid", gap: 8 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, background: C.surface2, borderRadius: 10, padding: "12px 14px" }}>
                <span className="cl-mono" style={{ fontSize: 13, color: C.textFaint, width: 20, flexShrink: 0 }}>
                  {e.rank}
                </span>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {e.name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }}>{e.name}</div>
                <div style={{ textAlign: "right" }}>
                  <div className="cl-mono" style={{ fontSize: 14, fontWeight: 700 }}>
                    ${e.cashCollected.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: C.textFaint }}>of ${e.projectedCash.toLocaleString()} projected</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
