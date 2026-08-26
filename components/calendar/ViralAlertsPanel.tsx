"use client";

// components/calendar/ViralAlertsPanel.tsx
//
// "Viral Alerts" view on the Content Calendar: watch a top-performing
// creator per brand board, and get told when one of their videos starts
// climbing fast (default 10k views/24h) — on Home and in the client's
// Discord 1-on-1 channel.
//
// "Check now" is manual rather than scheduled: Vercel's Hobby plan caps cron
// at once a day, and a check costs real money either way. Every tracked
// creator is fetched in ONE batched Apify call per check (see
// lib/apifyCreators.ts), so cost scales with checks rather than with how
// many creators are being watched. The scheduled version is written and
// ready in app/api/cron/viral-check.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, FileText, Flame, Loader2, Play, Plug, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { C, NICHES, CUSTOM_NICHE } from "@/lib/theme";
import { Card, Button, Badge, Field, EmptyState, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import {
  fetchTrackedCreators, fetchViralAlerts, dismissViralAlert, fetchCampaignNiche, updateCampaignNiche,
  type TrackedCreator, type ViralAlertVideo,
} from "@/lib/queries/viralAlerts";
import { formatVelocity, VIRAL_THRESHOLD_MIN } from "@/lib/viralAlerts";
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
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const router = useRouter();
  // null = still checking. Same as the Breakdown panel: only the `connected`
  // flag is readable client-side, never the key itself. Checked up front so a
  // client without one gets a setup path instead of an error after clicking.
  const [connected, setConnected] = useState<boolean | null>(null);

  // Niche of the board these creators belong to. Lives on the campaign so
  // it's picked once here and inherited by every creator and alert under
  // it — that's what makes the admin Viral Feed searchable by niche.
  const [niche, setNiche] = useState<string | null>(null);
  const [customNiche, setCustomNiche] = useState("");
  const [savingNiche, setSavingNiche] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("integrations")
        .select("connected")
        .eq("client_id", clientId)
        .eq("integration_key", "socialkit")
        .maybeSingle();
      if (!cancelled) setConnected(!!data?.connected);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [c, a] = await Promise.all([fetchTrackedCreators(supabase, clientId), fetchViralAlerts(supabase, clientId)]);
    setCreators(c);
    setAlerts(a);
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Reloaded per board rather than once: switching boards in the calendar
  // header swaps which campaign's niche is being edited.
  useEffect(() => {
    if (activeBrand === "All") {
      setNiche(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const value = await fetchCampaignNiche(createClient(), clientId, activeBrand);
      if (cancelled) return;
      setNiche(value);
      // A niche that isn't one of the presets came from the free-text box,
      // so put it back there instead of silently falling off the select.
      setCustomNiche(value && !NICHES.includes(value) ? value : "");
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, activeBrand]);

  async function saveNiche(value: string | null) {
    setNiche(value);
    setSavingNiche(true);
    try {
      await updateCampaignNiche(createClient(), clientId, activeBrand, value);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that niche — try again."));
    } finally {
      setSavingNiche(false);
    }
  }

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
    // A creator with no prior reading has nothing to measure a rate against,
    // so their first check can only set a baseline (that's what stops
    // tracking someone from dumping their whole back catalogue into Discord).
    // Without saying so, a first run reports "nothing over the threshold" and
    // reads as broken.
    const firstTimers = (creators || []).filter((c) => !c.lastCheckedAt).length;
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
      } else if (firstTimers > 0) {
        showToast(
          `Baseline set for ${firstTimers} creator${firstTimers > 1 ? "s" : ""} — alerts start from your next check, once there's a rate to measure.`,
          "success"
        );
      } else {
        showToast("Checked — nothing over the threshold yet.", "success");
      }
    } catch (err) {
      setError(toastMessage(err, "Couldn't run that check — try again."));
    } finally {
      setChecking(false);
    }
  }

  // Reuses the same route the script-level "Break down this reference" uses,
  // minus an entryId — there's no calendar entry to cache onto here, so the
  // transcript lives in component state until they turn it into a script.
  async function transcribe(a: ViralAlertVideo) {
    if (!a.url) return;
    setError("");
    setTranscribingId(a.id);
    try {
      const res = await fetch("/api/claude/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, referenceUrl: a.url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't transcribe that video");
      setTranscripts((prev) => ({ ...prev, [a.id]: json.transcript }));
    } catch (err) {
      setError(toastMessage(err, "Couldn't transcribe that video — try again."));
    } finally {
      setTranscribingId(null);
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
          <div style={{ display: "grid", gap: 10 }}>
            {alerts.map((a) => (
              <Card key={a.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${C.warning}` }}>
                <div style={{ display: "flex", gap: 14, padding: 14 }}>
                  {/* Poster frame doubles as the play affordance — clicking
                      it opens the real post, same as the Watch button. */}
                  {a.thumbnail ? (
                    <a
                      href={a.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ position: "relative", flexShrink: 0, width: 92, height: 122, borderRadius: 10, overflow: "hidden", display: "block", background: C.surface3 }}
                      title="Watch this video"
                    >
                      <img src={a.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.28)" }}>
                        <Play size={22} color="#fff" fill="#fff" />
                      </span>
                    </a>
                  ) : (
                    <div style={{ width: 92, height: 122, borderRadius: 10, background: C.surface3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Flame size={22} color={C.warning} />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <Badge tone="warning">{formatVelocity(a.velocity)}/24h</Badge>
                      {a.brand && <Badge tone="accent">{a.brand}</Badge>}
                      <span style={{ fontSize: 11, color: C.textFaint }}>{relativeTime(a.alertedAt)}</span>
                    </div>

                    <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45, marginBottom: 4 }}>
                      {a.description || "Untitled video"}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 10 }}>
                      @{a.creatorHandle} · {a.platform === "tiktok" ? "TikTok" : "Instagram"}
                    </div>

                    <div className="cl-mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                      <Eye size={14} color={C.textMuted} />
                      {formatVelocity(a.views)}
                      <span style={{ fontSize: 11, fontWeight: 400, color: C.textFaint }}>views</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <Button size="sm">
                            <Play size={12} /> Watch
                          </Button>
                        </a>
                      )}
                      {a.url && (
                        <Button size="sm" variant="secondary" onClick={() => transcribe(a)} disabled={transcribingId === a.id}>
                          {transcribingId === a.id ? <Loader2 size={12} className="cl-spin" /> : <FileText size={12} />}
                          {transcribingId === a.id ? "Transcribing..." : "Transcribe"}
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => dismiss(a.id)}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>

                {transcripts[a.id] && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: 14, background: C.surface2 }}>
                    <div className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Transcript
                    </div>
                    <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.65, whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }} className="cl-scroll">
                      {transcripts[a.id]}
                    </div>
                  </div>
                )}
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
          {creators.length > 0 && connected !== false && (
            <Button size="sm" variant="secondary" onClick={checkNow} disabled={checking || connected === null}>
              {checking ? <Loader2 size={12} className="cl-spin" /> : <RefreshCw size={12} />}
              {checking ? "Checking..." : "Check now"}
            </Button>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
          Paste a top performer in this niche and we'll watch their recent posts. When one starts climbing past the
          threshold, it shows up here, on your Home page, and in your Discord channel. The first check on a new creator
          just records where their videos stand — alerts start from the check after that, once there's a rate to compare
          against.
        </div>

        {connected === false && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: C.surface2, border: `1px dashed ${C.borderLight}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Plug size={15} color={C.accentLight} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Connect SocialKit to start watching</div>
              <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
                This is what reads a creator's recent posts and their view counts. Takes about a minute, and it's free
                for 20 checks a month. You can still add creators below in the meantime.
              </div>
              <Button size="sm" onClick={() => router.push("/integrations?connect=socialkit")}>
                <Plug size={12} /> Set it up
              </Button>
            </div>
          </div>
        )}

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

      {activeBrand !== "All" && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Niche for {activeBrand}</div>
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 12, lineHeight: 1.5 }}>
            What vertical this board is in. Tag it once and every creator you track here — and every viral video they
            put out — gets filed under it, so proven formats from your niche can be pulled into your Format SOPs.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: niche === CUSTOM_NICHE || customNiche ? "1fr 1fr" : "1fr", gap: 10 }}>
            <select
              style={inputStyle}
              value={niche === null ? "" : NICHES.includes(niche) ? niche : CUSTOM_NICHE}
              onChange={(e) => {
                const v = e.target.value;
                if (v === CUSTOM_NICHE) {
                  // Don't write anything yet — wait for the text box, or the
                  // board would briefly be tagged with the sentinel itself.
                  setNiche(CUSTOM_NICHE);
                  setCustomNiche("");
                } else {
                  setCustomNiche("");
                  saveNiche(v || null);
                }
              }}
            >
              <option value="">Not set</option>
              {NICHES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value={CUSTOM_NICHE}>{CUSTOM_NICHE}</option>
            </select>
            {(niche === CUSTOM_NICHE || customNiche) && (
              <input
                style={inputStyle}
                value={customNiche}
                onChange={(e) => setCustomNiche(e.target.value)}
                onBlur={() => saveNiche(customNiche.trim() || null)}
                onKeyDown={(e) => e.key === "Enter" && saveNiche(customNiche.trim() || null)}
                placeholder="Type your niche..."
              />
            )}
          </div>
          {savingNiche && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8 }}>Saving...</div>}
        </Card>
      )}

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
            <input
              style={inputStyle}
              type="number"
              min={VIRAL_THRESHOLD_MIN}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={String(VIRAL_THRESHOLD_MIN)}
            />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, marginTop: -6, lineHeight: 1.5 }}>
          Minimum {VIRAL_THRESHOLD_MIN.toLocaleString()} views/24h — anything lower gets raised to it. Raise it for a big
          account that clears that without trying; the floor is there so an ordinary post on a small account never trips
          an alert.
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
          Every tracked creator is fetched in one batched call per check, so adding more creators costs very little
          extra — roughly 50–60 checks a month on the free plan.
        </div>
      </Card>
    </div>
  );
}
