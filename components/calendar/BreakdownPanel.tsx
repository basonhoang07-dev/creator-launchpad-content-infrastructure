"use client";

// components/calendar/BreakdownPanel.tsx
//
// The "Breakdown" tab: paste any Instagram Reel or TikTok you want to model
// after, and it comes back as a new unscripted concept on the active brand
// board — reference link, full transcript, and the framework table all
// attached, ready to write.
//
// Previously this only existed tucked under the reference-link field of a
// script that already had one, which meant you had to already know it was
// there. This is the same engine, surfaced as a tool with its own tab.

import React, { useState } from "react";
import { AlertCircle, ArrowRight, ChevronDown, ChevronUp, Layers, Loader2, Sparkles, Wand2 } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Badge, Field, inputStyle } from "@/components/ui";
import type { ReferenceFrameworkPart } from "@/lib/queries/calendar";
import { toastMessage } from "@/components/Toast";

function FrameworkPartCard({ part }: { part: ReferenceFrameworkPart }) {
  return (
    <Card style={{ padding: 14 }}>
      <Badge tone="accent">{part.part}</Badge>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, fontStyle: "italic", margin: "10px 0 12px", borderLeft: `2px solid ${C.accent}`, paddingLeft: 12 }}>
        "{part.content}"
      </div>
      <div style={{ display: "grid", gap: 8, fontSize: 12, lineHeight: 1.55 }}>
        <div>
          <span style={{ color: C.accentLight, fontWeight: 700 }}>Why it hooks: </span>
          <span style={{ color: C.textMuted }}>{part.curiosityLoop}</span>
        </div>
        {part.immutable && (
          <div>
            <span style={{ color: C.warning, fontWeight: 700 }}>Keep as theirs, not yours: </span>
            <span style={{ color: C.textMuted }}>{part.immutable}</span>
          </div>
        )}
        <div>
          <span style={{ color: C.success, fontWeight: 700 }}>Make it yours: </span>
          <span style={{ color: C.textMuted }}>{part.yourVersion}</span>
        </div>
        <div>
          <span style={{ color: C.accentLight, fontWeight: 700 }}>Tonality: </span>
          <span style={{ color: C.textMuted }}>{part.tonality}</span>
        </div>
        {part.visual && (
          <div>
            <span style={{ color: C.accentLight, fontWeight: 700 }}>Dressing & background: </span>
            <span style={{ color: C.textMuted }}>{part.visual}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function BreakdownPanel({
  clientId,
  activeBrand,
  brands,
  onOpenEntry,
}: {
  clientId: string;
  activeBrand: string;
  brands: string[];
  onOpenEntry: (entryId: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [result, setResult] = useState<{ transcript: string; framework: ReferenceFrameworkPart[]; entry: { id: string; title: string } } | null>(null);

  // It files the result onto a specific board, so it needs to know which one.
  const needsBoard = activeBrand === "All";

  async function run() {
    if (!url.trim() || needsBoard) return;
    setError("");
    setResult(null);
    setRunning(true);
    try {
      const res = await fetch("/api/claude/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, referenceUrl: url.trim(), createInBrand: activeBrand }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't break that down");
      setResult({ transcript: json.transcript, framework: json.framework, entry: json.entry });
      setUrl("");
    } catch (err) {
      setError(toastMessage(err, "Couldn't break that down — check the link is a public Instagram Reel or TikTok."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Wand2 size={15} color={C.accentLight} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Break down a reference video</div>
        </div>
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
          Paste any Instagram Reel or TikTok you want to model after. You'll get the full transcript plus a framework
          breakdown — hooks, intention, body, lesson — with what's locked to that creator's story, what to swap for your
          own, how to deliver it, and what to wear. It lands as a new concept
          {activeBrand !== "All" ? <> on <b style={{ color: C.accentLight }}>{activeBrand}</b></> : " on the board you pick"}, ready to write.
        </div>

        {needsBoard ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.surface2, border: `1px dashed ${C.borderLight}`, borderRadius: 10, padding: 14 }}>
            <Layers size={15} color={C.accentLight} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
              Pick a brand board above first — the breakdown gets filed as a concept on that board, so it needs to know
              which campaign it's for.
              {brands.length === 0 && " You don't have any boards yet — create one with \"New board\"."}
            </div>
          </div>
        ) : (
          <>
            <Field label="Reference video link">
              <input
                style={inputStyle}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="https://www.instagram.com/reels/... or https://www.tiktok.com/@.../video/..."
              />
            </Field>
            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14, marginTop: -6, lineHeight: 1.5 }}>
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
              </div>
            )}
            <Button onClick={run} disabled={running || !url.trim()}>
              {running ? <Loader2 size={13} className="cl-spin" /> : <Sparkles size={13} />}
              {running ? "Breaking it down..." : `Break it down into ${activeBrand}`}
            </Button>
            <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 12, lineHeight: 1.5 }}>
              Uses one SocialKit request (free plan gives 20/month, shared with Viral Alert checks) plus one AI credit.
            </div>
          </>
        )}
      </Card>

      {result && (
        <>
          <Card style={{ border: `1px solid ${C.success}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.success, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                Added to {activeBrand}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{result.entry.title}</div>
            </div>
            <Button size="sm" onClick={() => onOpenEntry(result.entry.id)}>
              Open script <ArrowRight size={13} />
            </Button>
          </Card>

          <div>
            <button
              onClick={() => setTranscriptOpen((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.textMuted, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 8 }}
            >
              {transcriptOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Inspiration (full transcript)
            </button>
            {transcriptOpen && (
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, fontSize: 12.5, color: C.textMuted, lineHeight: 1.65, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }} className="cl-scroll">
                {result.transcript}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {result.framework.map((part, i) => (
              <FrameworkPartCard key={i} part={part} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
