"use client";

// components/MarkdownText.tsx
//
// Minimal markdown renderer for SOP bodies and anywhere else a stored
// string may contain formatting.
//
// SOP bodies were rendered as plain pre-wrap text, which was fine while
// every SOP was hand-typed. Format SOPs generated from a viral alert are
// written as markdown (headings per beat, bold labels, a source link), and
// as plain text those come out as literal "##" and "**" noise.
//
// Deliberately hand-rolled rather than pulling in a markdown library: this
// covers the constructs actually produced (heading, bullet, bold, italic,
// link) and builds React elements directly, so there's no
// dangerouslySetInnerHTML and no HTML-injection surface from SOP text that
// any team member can edit.

import React from "react";
import { C } from "@/lib/theme";

const INLINE = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;

// Only http(s) links are turned into anchors — a javascript: or data: URL
// typed into an SOP stays inert text.
function isSafeHref(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} style={{ color: C.text, fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return <em key={key} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</em>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && isSafeHref(link[2])) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" style={{ color: C.accentLight }}>
          {link[1]}
        </a>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export default function MarkdownText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const lines = (text || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  // Bullets are accumulated and flushed as one <ul> so consecutive "- "
  // lines become a single list rather than one list per line.
  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={{ margin: "0 0 12px", paddingLeft: 20, display: "grid", gap: 6 }}>
        {items.map((b, i) => (
          <li key={i} style={{ lineHeight: 1.6 }}>{renderInline(b, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flushBullets();

    if (!line.trim()) return;

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div
          key={`h-${i}`}
          style={{
            fontSize: level <= 2 ? 14.5 : 13.5,
            fontWeight: 600,
            color: C.text,
            margin: blocks.length === 0 ? "0 0 8px" : "18px 0 8px",
          }}
        >
          {renderInline(heading[2], `h-${i}`)}
        </div>
      );
      return;
    }

    blocks.push(
      <p key={`p-${i}`} style={{ margin: "0 0 12px", lineHeight: 1.65 }}>
        {renderInline(line, `p-${i}`)}
      </p>
    );
  });
  flushBullets();

  return <div style={{ fontSize: 13.5, color: C.textMuted, ...style }}>{blocks}</div>;
}
