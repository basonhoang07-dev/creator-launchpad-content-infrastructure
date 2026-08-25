"use client";

// components/calendar/ReferenceBreakdownPanel.tsx
//
// Turns a script's reference video link (Instagram Reel/TikTok) into a full
// transcript + a reusable framework breakdown, via
// app/api/claude/analyze-reference. Renders inline under the reference link
// field in the Content Calendar entry modal. Result is cached on the entry
// (reference_transcript/reference_framework) so reopening the script never
// re-spends the API credits — only an explicit "Re-analyze" click does.

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Plug, Sparkles } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase";
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
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // null = still checking. Only the `connected` flag is readable here — the
  // API key itself lives in the RLS-locked socialkit_connections table and
  // never reaches the browser.
  const [connected, setConnected] = useState<boolean | null>(null);

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
      // The route's own messages already name the real cause (key rejected,
      // monthly quota used up, not connected yet) — only fall back to a
      // generic hint when there's genuinely nothing more specific.
      setError(toastMessage(err, "Couldn't break down that reference — check the link is a public Instagram Reel or TikTok."));
    } finally {
      setAnalyzing(false);
    }
  }

  const hasBreakdown = !!entry.referenceFramework?.length;
  // Don't dead-end them on an error after the click — if SocialKit isn't
  // connected yet, hand them the setup path up front instead. Deep-links
  // straight into the connect flow on Integrations rather than dropping
  // them on the page to hunt for the right card.
  const needsSetup = connected === false && !hasBreakdown;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasBreakdown ? 12 : 0 }}>
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Reference breakdown</div>
        {!needsSetup && (
          <Button size="sm" variant="secondary" onClick={analyze} disabled={analyzing || connected === null}>
            {analyzing ? <Loader2 size={12} className="cl-spin" /> : <Sparkles size={12} />}
            {analyzing ? "Analyzing..." : hasBreakdown ? "Re-analyze" : "Break down this reference"}
          </Button>
        )}
      </div>

      {needsSetup && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: C.surface2, border: `1px dashed ${C.borderLight}`, borderRadius: 10, padding: 14, marginTop: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Plug size={15} color={C.accentLight} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Turn this reference into a script framework</div>
            <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
              Pulls the full transcript off this Reel/TikTok and breaks it into hooks, intention, body, and lesson — with
              what to keep, what to swap for your own story, and how to deliver it. Takes about a minute to set up, and
              it's free for 20 breakdowns a month.
            </div>
            <Button size="sm" onClick={() => router.push("/integrations?connect=socialkit")}>
              <Plug size={12} /> Set it up
            </Button>
          </div>
        </div>
      )}

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
