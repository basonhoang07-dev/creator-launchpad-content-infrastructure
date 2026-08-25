"use client";

// components/calendar/ViralAlertsPanel.tsx
//
// "Viral Alerts" view on the Content Calendar: watch a top-performing
// creator per brand board, and get told when one of their videos starts
// climbing fast (default 10k views/24h) — on Home and in the client's
// Discord 1-on-1 channel.
//
// "Check now" is manual rather than automatic because each check spends one
// SocialKit request per tracked creator out of the client's monthly quota
// (free tier is 20, shared with reference breakdowns). The scheduled version
// is written and ready in app/api/cron/viral-check for when they're on a
// paid tier.

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Flame, Loader2, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Badge, Field, EmptyState, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import {
  fetchTrackedCreators, fetchViralAlerts, dismissViralAlert,
  type TrackedCreator, type ViralAlertVideo,
} from "@/lib/queries/viralAlerts";
import { formatVelocity } from "@/lib/viralAlerts";
import { useToast, toastMessage } from "@/components/Toast";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ViralAlertsPanel({ clientId, activeBrand }: { clientId: string; activeBrand: string }) {
  const { showToast } = useToast();
  const [creators, setCreators] = useState<TrackedCreator[] | null>(null);
  const [alerts, setAlerts] = useState<ViralAlertVideo[]>([]);
  const [platform, setPlatform] = useState<"tiktok" | "instagram">("tiktok");
  const [input, setInput] = useState("");
  const [threshold, setThreshold] = useState("10000");
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [c, a] = await Promise.all([fetchTrackedCreators(supabase, clientId), fetchViralAlerts(supabase, clientId)]);
    setCreators(c);
    setAlerts(a);
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function addCreator() {
    if (!input.trim()) return;
    setError("");
    setAdding(true);
    try {
      const res = await fetch("/api/creators/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          brand: activeBrand === "All" ? null : activeBrand,
          platform,
          input: input.trim(),
          threshold: Number(threshold) || 10000,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't track that creator");
      setInput("");
      reload();
    } catch (err) {
      setError(toastMessage(err, "Couldn't track that creator — try again."));
    } finally {
      setAdding(false);
    }
  }

  async function removeCreator(id: string) {
    try {
      const res = await fetch("/api/creators/track", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, creatorId: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't remove");
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't stop tracking that creator — try again."));
    }
  }

  async function checkNow() {
    setError("");
    setChecking(true);
    try {
      const res = await fetch("/api/creators/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Check failed");
      await reload();
      if (json.hits?.length) {
        showToast(`${json.hits.length} video${json.hits.length > 1 ? "s" : ""} going viral — posted to your Discord.`, "success");
      } else if (json.errors?.length) {
        setError(json.errors.join(" · "));
      } else {
        showToast("Checked — nothing over the threshold yet.", "success");
      }
    } catch (err) {
      setError(toastMessage(err, "Couldn't run that check — try again."));
    } finally {
      setChecking(false);
    }
  }

  async function dismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await dismissViralAlert(createClient(), id);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't dismiss that alert — try again."));
      reload();
    }
  }

  if (!creators) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {alerts.length > 0 && (
        <div>
          <div className="cl-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.warning, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
            Going viral now
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {alerts.map((a) => (
              <Card key={a.id} style={{ padding: 12, display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.warning}` }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(245,166,35,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Flame size={16} color={C.warning} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.description || "Untitled video"}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                    @{a.creatorHandle}
                    {a.brand ? ` · ${a.brand}` : ""} · {relativeTime(a.alertedAt)}
                  </div>
                </div>
                <Badge tone="warning">{formatVelocity(a.velocity)}/24h</Badge>
                <span className="cl-mono" style={{ fontSize: 11, color: C.textFaint }}>{formatVelocity(a.views)} views</span>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: C.accentLight, display: "flex" }} title="Open video">
                    <ExternalLink size={14} />
                  </a>
                )}
                <button onClick={() => dismiss(a.id)} title="Dismiss" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                  <Trash2 size={13} />
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <TrendingUp size={15} /> Creators you're watching
          </div>
          {creators.length > 0 && (
            <Button size="sm" variant="secondary" onClick={checkNow} disabled={checking}>
              {checking ? <Loader2 size={12} className="cl-spin" /> : <RefreshCw size={12} />}
              {checking ? "Checking..." : "Check now"}
            </Button>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
          Paste a top performer in this niche and we'll watch their recent posts. When one starts climbing past the
          threshold, it shows up here, on your Home page, and in your Discord channel.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {creators.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 10, padding: "10px 12px" }}>
              <Badge tone="accent">{c.platform === "tiktok" ? "TikTok" : "Instagram"}</Badge>
              <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: C.text, textDecoration: "none", flex: 1, minWidth: 0 }}>
                @{c.handle}
              </a>
              {c.brand && <span style={{ fontSize: 11, color: C.textFaint }}>{c.brand}</span>}
              <span className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint }}>
                {formatVelocity(c.viralThreshold)}/24h · checked {relativeTime(c.lastCheckedAt)}
              </span>
              <button onClick={() => removeCreator(c.id)} title="Stop tracking" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {creators.length === 0 && <EmptyState icon={TrendingUp} text="No creators tracked yet — add one below." />}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Track a creator{activeBrand !== "All" ? ` for ${activeBrand}` : ""}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["tiktok", "instagram"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${platform === p ? C.accent : C.border}`,
                background: platform === p ? C.accentDim : "transparent",
                color: platform === p ? C.accentLight : C.textMuted,
              }}
            >
              {p === "tiktok" ? "TikTok" : "Instagram"}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Field label="Profile link or @handle">
            <input
              style={inputStyle}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCreator()}
              placeholder={platform === "tiktok" ? "@creator or tiktok.com/@creator" : "@creator or instagram.com/creator"}
            />
          </Field>
          <Field label="Alert above (views/24h)">
            <input style={inputStyle} type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="10000" />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, marginTop: -6, lineHeight: 1.5 }}>
          Set the threshold to what's actually notable <i>for this creator</i> — a big account clears 10k without trying,
          a smaller one hitting it means something.
        </div>
        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14, lineHeight: 1.5 }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}
        <Button onClick={addCreator} disabled={adding || !input.trim()}>
          {adding ? <Loader2 size={13} className="cl-spin" /> : <Plus size={13} />}
          {adding ? "Adding..." : "Track this creator"}
        </Button>
        <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 12, lineHeight: 1.5 }}>
          Each "Check now" uses one SocialKit request per creator you're tracking — the free plan gives you 20 a month,
          shared with reference breakdowns.
        </div>
      </Card>
    </div>
  );
}
