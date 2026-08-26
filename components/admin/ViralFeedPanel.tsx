"use client";

// components/admin/ViralFeedPanel.tsx
//
// Admin-only cross-client view of every viral alert across the whole roster,
// filterable by niche, client, brand and platform.
//
// The point isn't monitoring — it's harvesting. A format that took off in
// one client's niche is usually worth handing to everyone in that niche, so
// each alert carries a "Make Format SOP" action that runs the breakdown and
// drops the framework straight into a Format SOP the whole org can read.
// Without this, every breakdown stays buried inside the one script it was
// run on.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, ExternalLink, Eye, Flame, Loader2, Play, Search } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Badge, EmptyState, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { fetchAdminViralAlerts, type AdminViralAlert } from "@/lib/queries/viralAlerts";
import { formatVelocity } from "@/lib/viralAlerts";
import { useToast, toastMessage } from "@/components/Toast";

const ALL = "__all__";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ViralFeedPanel() {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<AdminViralAlert[] | null>(null);
  const [search, setSearch] = useState("");
  const [niche, setNiche] = useState(ALL);
  const [client, setClient] = useState(ALL);
  const [platform, setPlatform] = useState(ALL);
  const [sort, setSort] = useState<"recent" | "velocity" | "views">("recent");
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setAlerts(await fetchAdminViralAlerts(createClient()));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Options come from the data rather than a fixed list, so a niche only
  // appears once something in it has actually fired.
  const { niches, clients } = useMemo(() => {
    const n = new Set<string>();
    const c = new Set<string>();
    (alerts || []).forEach((a) => {
      if (a.niche) n.add(a.niche);
      if (a.clientName) c.add(a.clientName);
    });
    return { niches: [...n].sort(), clients: [...c].sort() };
  }, [alerts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (alerts || []).filter((a) => {
      if (niche !== ALL && a.niche !== niche) return false;
      if (client !== ALL && a.clientName !== client) return false;
      if (platform !== ALL && a.platform !== platform) return false;
      if (!q) return true;
      return (
        (a.description || "").toLowerCase().includes(q) ||
        (a.creatorHandle || "").toLowerCase().includes(q) ||
        (a.brand || "").toLowerCase().includes(q) ||
        (a.niche || "").toLowerCase().includes(q)
      );
    });
    const sorted = [...rows];
    if (sort === "velocity") sorted.sort((a, b) => b.velocity - a.velocity);
    else if (sort === "views") sorted.sort((a, b) => b.views - a.views);
    else sorted.sort((a, b) => (b.alertedAt || "").localeCompare(a.alertedAt || ""));
    return sorted;
  }, [alerts, search, niche, client, platform, sort]);

  async function makeFormatSop(a: AdminViralAlert) {
    if (!a.url) return;
    setError("");
    setPromotingId(a.id);
    try {
      const res = await fetch("/api/admin/viral-to-sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: a.clientId, videoId: a.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't create that SOP");
      showToast(
        json.alreadyExisted
          ? `"${json.sop?.title || "Untitled"}" is already a Format SOP — find it under SOP Libraries.`
          : `Format SOP created: "${json.sop?.title || "Untitled"}" — find it under SOP Libraries.`,
        "success"
      );
    } catch (err) {
      setError(toastMessage(err, "Couldn't turn that into a Format SOP — try again."));
    } finally {
      setPromotingId(null);
    }
  }

  if (!alerts) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  const selectStyle = { ...inputStyle, width: "auto", minWidth: 132, padding: "7px 10px", fontSize: 12.5 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <Flame size={15} color={C.warning} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Viral feed — every client</div>
        </div>
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
          Everything that's crossed its threshold across your whole roster. Filter by niche to find a format worth
          handing to everyone in it, then turn it into a Format SOP your clients can rip.
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            style={{ ...inputStyle, paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search caption, creator, brand, or niche..."
          />
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}>
            <Search size={14} />
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select style={selectStyle} value={niche} onChange={(e) => setNiche(e.target.value)}>
            <option value={ALL}>All niches</option>
            {niches.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select style={selectStyle} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value={ALL}>All clients</option>
            {clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select style={selectStyle} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value={ALL}>All platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
          <select style={selectStyle} value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="recent">Newest first</option>
            <option value="velocity">Fastest climbing</option>
            <option value="views">Most views</option>
          </select>
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11.5, color: C.textFaint }}>
            {filtered.length} of {alerts.length}
          </span>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.danger, marginTop: 12, lineHeight: 1.5 }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Flame}
          text={
            alerts.length === 0
              ? "Nothing has crossed its threshold yet. Alerts land here as soon as a tracked creator takes off."
              : "No alerts match those filters."
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((a) => (
            <Card key={a.id} style={{ padding: 14, display: "flex", gap: 14 }}>
              {a.thumbnail ? (
                <a
                  href={a.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ position: "relative", flexShrink: 0, width: 78, height: 104, borderRadius: 9, overflow: "hidden", display: "block", background: C.surface3 }}
                  title="Watch this video"
                >
                  <img src={a.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.28)" }}>
                    <Play size={18} color="#fff" fill="#fff" />
                  </span>
                </a>
              ) : (
                <div style={{ width: 78, height: 104, borderRadius: 9, background: C.surface3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Flame size={18} color={C.warning} />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <Badge tone="warning">{formatVelocity(a.velocity)}/24h</Badge>
                  {a.niche && <Badge tone="accent">{a.niche}</Badge>}
                  <span style={{ fontSize: 11, color: C.textFaint }}>
                    {a.clientName}
                    {a.brand ? ` · ${a.brand}` : ""} · {relativeTime(a.alertedAt)}
                  </span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, marginBottom: 3 }}>
                  {a.description || "Untitled video"}
                </div>
                <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 10 }}>
                  @{a.creatorHandle} · {a.platform === "tiktok" ? "TikTok" : "Instagram"} ·{" "}
                  <Eye size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {formatVelocity(a.views)} views
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  <Button size="sm" onClick={() => makeFormatSop(a)} disabled={promotingId === a.id || !a.url}>
                    {promotingId === a.id ? <Loader2 size={12} className="cl-spin" /> : <BookOpen size={12} />}
                    {promotingId === a.id ? "Building..." : "Make Format SOP"}
                  </Button>
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                      <Button size="sm" variant="secondary">
                        <ExternalLink size={12} /> Open
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
