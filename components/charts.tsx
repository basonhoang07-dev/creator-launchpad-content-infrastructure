"use client";

// components/charts.tsx
//
// Hand-rolled SVG charts (no external chart library), ported verbatim from
// cl_dashboard_prototype.jsx: ProgressRing, TrendChart (shared by the
// client's personal income trend and Admin's community view), DonutChart,
// LeaderboardBars.

import React from "react";
import { C } from "@/lib/theme";

export function ProgressRing({
  pct,
  size = 128,
  sublabel,
}: {
  pct: number;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - 14) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={C.surface3} strokeWidth={10} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={C.accent}
          strokeWidth={10}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="cl-mono" style={{ fontSize: 22, fontWeight: 700 }}>
          {Math.round(clamped)}%
        </div>
        {sublabel && <div style={{ fontSize: 10, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function niceStep(rawStep: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
function formatCompactUSD(v: number) {
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
}

export interface TrendPoint {
  month: string;
  total: number;
}

// Single shared trend chart — real proportional design units (not percentage
// placeholders), so the aspect-ratio lock is always correct regardless of
// container width.
export function TrendChart({ points, maxWidth = 640 }: { points: TrendPoint[]; maxWidth?: number }) {
  const W = 560,
    H = 220;
  const marginLeft = 56,
    marginBottom = 26,
    marginTop = 10,
    marginRight = 10;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;

  const values = points.map((p) => p.total);
  const dataMax = Math.max(...values);
  const dataMin = 0; // always anchor to zero so growth reads honestly
  const tickStep = niceStep((dataMax - dataMin) / 4);
  const yMax = Math.ceil(dataMax / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += tickStep) ticks.push(v);

  const stepX = plotW / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => ({
    x: marginLeft + i * stepX,
    y: marginTop + plotH - (p.total / (yMax || 1)) * plotH,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x} ${marginTop + plotH} L ${coords[0].x} ${marginTop + plotH} Z`
    : "";

  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  return (
    <div style={{ width: "100%", maxWidth, aspectRatio: `${W} / ${H}`, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="communityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const y = marginTop + plotH - (t / (yMax || 1)) * plotH;
          return (
            <g key={t}>
              <line x1={marginLeft} x2={W - marginRight} y1={y} y2={y} stroke={C.border} strokeWidth="1" />
              <text x={marginLeft - 8} y={y + 3} fontSize="10" fill={C.textFaint} textAnchor="end" fontFamily="monospace">
                {formatCompactUSD(t)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#communityFill)" stroke="none" />
        <path d={linePath} fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="4.5" fill={C.bg} stroke={C.accentLight} strokeWidth="2.5" />
            {i === coords.length - 1 && (
              <text x={c.x} y={c.y - 14} fontSize="12" fontWeight="700" fill={C.accentLight} textAnchor="end" fontFamily="monospace">
                {formatCompactUSD(points[i].total)}
              </text>
            )}
          </g>
        ))}

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={i}
              x={coords[i].x}
              y={H - 6}
              fontSize="10"
              fill={C.textFaint}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            >
              {p.month}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

// Horizontal bar leaderboard — same data as the list rows below it, just rendered
// as scaled bars so relative standing is visible at a glance.
export function LeaderboardBars({ clients }: { clients: { id: string; name: string; contractedCash: number; otherEarnings: number }[] }) {
  const max = Math.max(...clients.map((c) => c.contractedCash + c.otherEarnings), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {clients.map((c) => {
        const total = c.contractedCash + c.otherEarnings;
        const pct = (total / max) * 100;
        return (
          <div key={c.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
              <span style={{ color: C.text, fontWeight: 600 }}>{c.name}</span>
              <span className="cl-mono" style={{ color: C.accentLight, fontWeight: 700 }}>
                ${total.toLocaleString()}
              </span>
            </div>
            <div style={{ width: "100%", height: 10, background: C.surface3, borderRadius: 5, overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.accent}, ${C.accentLight})`,
                  borderRadius: 5,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Donut chart with a legend row — used for the community earnings-by-client breakdown
// and the client's personal income-mix-by-brand breakdown.
export const DONUT_PALETTE = [C.accent, C.accentLight, "#4C8DFF", C.success, C.warning, "#E5484D"];

export function DonutChart({ segments, size = 160 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const r = size / 2 - 14;
  const cx = size / 2,
    cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} stroke={C.surface3} strokeWidth={16} fill="none" />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * circumference;
          const offset = -cumulative * circumference;
          cumulative += frac;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={16}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div style={{ display: "grid", gap: 7, flex: 1, minWidth: 140 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.label}</span>
            <span className="cl-mono" style={{ fontSize: 11, color: C.textFaint, flexShrink: 0 }}>
              {Math.round((seg.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
