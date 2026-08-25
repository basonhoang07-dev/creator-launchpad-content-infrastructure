"use client";

// components/calendar/ReferenceBreakdownPanel.tsx
//
// Turns a script's reference video link (Instagram Reel/TikTok) into a full
// transcript + a reusable framework breakdown, via
// app/api/claude/analyze-reference. Renders inline under the reference link
// field in the Content Calendar entry modal. Result is cached on the entry
// (reference_transcript/reference_framework) so reopening the script never
// re-spends the API credits — only an explicit "Re-analyze" click does.

import React, { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Badge } from "@/components/ui";
import type { CalendarEntry, ReferenceFrameworkPart } from "@/lib/queries/calendar";
import { useToast, toastMessage } from "@/components/Toast";

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

export default function ReferenceBreakdownPanel({
  entry,
  clientId,
  onUpdated,
}: {
  entry: CalendarEntry;
  clientId: string;
  onUpdated: (patch: Partial<CalendarEntry>) => void;
}) {
  const { showToast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  if (!entry.referenceLink?.trim()) return null;

  async function analyze() {
    setError("");
    setAnalyzing(true);
    try {
      const res = await fetch("/api/claude/analyze-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, entryId: entry.id, referenceUrl: entry.referenceLink }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't break down that reference");
      onUpdated({ referenceTranscript: json.transcript, referenceFramework: json.framework });
    } catch (err) {
      setError(toastMessage(err, "Couldn't break down that reference — check the link is a public Instagram Reel or TikTok."));
    } finally {
      setAnalyzing(false);
    }
  }

  const hasBreakdown = !!entry.referenceFramework?.length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasBreakdown ? 12 : 0 }}>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Reference breakdown</div>
        <Button size="sm" variant="secondary" onClick={analyze} disabled={analyzing}>
          {analyzing ? <Loader2 size={12} className="cl-spin" /> : <Sparkles size={12} />}
          {analyzing ? "Analyzing..." : hasBreakdown ? "Re-analyze" : "Break down this reference"}
        </Button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.danger, marginTop: 10 }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {entry.referenceTranscript && (
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <button
            onClick={() => setTranscriptOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.textMuted, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            {transcriptOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Inspiration (full transcript)
          </button>
          {transcriptOpen && (
            <div style={{ marginTop: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, fontSize: 12.5, color: C.textMuted, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }} className="cl-scroll">
              {entry.referenceTranscript}
            </div>
          )}
        </div>
      )}

      {hasBreakdown && (
        <div style={{ display: "grid", gap: 10 }}>
          {entry.referenceFramework!.map((part, i) => (
            <FrameworkPartCard key={i} part={part} />
          ))}
        </div>
      )}
    </div>
  );
}
