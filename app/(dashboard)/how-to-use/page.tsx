"use client";

// app/(dashboard)/how-to-use/page.tsx — How to use Creator Launchpad
//
// A short narrated walkthrough per feature, so a client can find the one
// thing they're stuck on and get back to posting.
//
// Every card carries both a voiceover and the same script in writing. That
// isn't redundancy: someone looking up "how do I book a shoot" mid-task
// wants to skim, not sit through a minute of audio, and someone learning the
// app the first time wants the opposite. One script drives both, so the two
// can't drift apart.

import React, { useState } from "react";
import { ArrowUpRight, Pause, Play, PlayCircle } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, EmptyState, SectionHeader } from "@/components/ui";
import { WALKTHROUGHS, type Walkthrough } from "@/lib/howToUse";
import Link from "next/link";

export default function HowToUsePage() {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeader eyebrow="HELP" title="How to use Creator Launchpad" />

      <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.65, marginTop: -10, maxWidth: 640 }}>
        Short walkthroughs of every part of the app. Play the one you need, or read it — they're the same words either
        way. Then get back to posting.
      </div>

      {WALKTHROUGHS.length === 0 ? (
        <EmptyState icon={PlayCircle} text="Walkthroughs are being recorded." />
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {WALKTHROUGHS.map((w) => (
            <WalkthroughCard key={w.slug} walkthrough={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WalkthroughCard({ walkthrough }: { walkthrough: Walkthrough }) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Audio and stills are committed under /public rather than uploaded, so a
  // walkthrough ships in the same commit as the feature it describes.
  const audioSrc = `/how-to-use/${walkthrough.slug}.mp3`;
  const stillSrc = `/how-to-use/${walkthrough.slug}.png`;

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      // Nothing is preloaded — most visitors read one card and leave, and
      // eight audio files fetched on mount is a slow page for no reason.
      el.play().catch(() => setPlaying(false));
    }
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", background: C.surface3, aspectRatio: "16 / 10" }}>
        <img
          src={stillSrc}
          alt=""
          onError={(e) => {
            // No still captured yet — fall back to the panel colour rather
            // than a broken image icon.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left", display: "block" }}
        />

        <button
          onClick={toggle}
          title={playing ? "Pause" : "Play the walkthrough"}
          style={{
            position: "absolute", left: 12, bottom: 12,
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(0,0,0,0.72)", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 15px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          {playing ? <Pause size={13} fill="#fff" /> : <Play size={13} fill="#fff" />}
          {playing ? "Playing" : "Play"}
        </button>

        <audio
          ref={audioRef}
          src={audioSrc}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>

      <div style={{ padding: 15, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{walkthrough.title}</div>
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>{walkthrough.summary}</div>

        {expanded && (
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.75, borderLeft: `2px solid ${C.accent}`, paddingLeft: 12, marginTop: 2 }}>
            {walkthrough.narration}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto", paddingTop: 6 }}>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {expanded ? "Hide the write-up" : "Read it instead"}
          </button>
          <Link
            href={walkthrough.href}
            style={{ marginLeft: "auto", fontSize: 12, color: C.textFaint, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
          >
            Open it <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </Card>
  );
}
