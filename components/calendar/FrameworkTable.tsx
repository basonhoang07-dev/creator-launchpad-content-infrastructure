"use client";

// components/calendar/FrameworkTable.tsx
//
// Renders a reference breakdown: a two-column table (plug-and-play skeleton
// | why it works) across the four beats, then two end sections — what to
// swap so it's yours, and how to actually shoot it (wardrobe, setting, and
// per-section tonality).
//
// Shared by the Breakdown tab and the per-script panel so the two can't
// drift. Tolerates the older per-part shape (content/curiosityLoop/
// yourVersion/tonality/visual) that entries created before this redesign
// still hold in jsonb, rather than rendering blanks for them.

import React from "react";
import { Shirt, Camera, Mic, Replace } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge } from "@/components/ui";
import type { ReferenceBreakdown } from "@/lib/queries/calendar";

// Entries breakdown-ed before the two-column redesign stored a bare array of
// the old per-part shape. Coerce either into what this component renders.
export function normalizeBreakdown(raw: any): ReferenceBreakdown | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return {
      parts: raw.map((p: any) => ({
        part: p.part,
        framework: p.framework ?? p.content ?? "",
        explanation: p.explanation ?? p.curiosityLoop ?? "",
      })),
      whatToChange: raw.flatMap((p: any) => (p.yourVersion ? [`${p.part}: ${p.yourVersion}`] : [])),
      delivery: {
        wardrobe: raw.find((p: any) => p.visual)?.visual ?? null,
        setting: null,
        tonality: raw.flatMap((p: any) => (p.tonality ? [{ section: p.part, direction: p.tonality }] : [])),
      },
    };
  }

  if (!Array.isArray(raw.parts)) return null;
  return {
    parts: raw.parts,
    whatToChange: Array.isArray(raw.whatToChange) ? raw.whatToChange : [],
    delivery: {
      wardrobe: raw.delivery?.wardrobe ?? null,
      setting: raw.delivery?.setting ?? null,
      tonality: Array.isArray(raw.delivery?.tonality) ? raw.delivery.tonality : [],
    },
  };
}

export default function FrameworkTable({ breakdown }: { breakdown: ReferenceBreakdown }) {
  const { parts, whatToChange, delivery } = breakdown;
  const hasDelivery = !!(delivery.wardrobe || delivery.setting || delivery.tonality.length);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "10px 14px", fontSize: 10, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", width: 130 }}>
                  Part
                </th>
                <th style={{ padding: "10px 14px", fontSize: 10, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Plug &amp; play
                </th>
                <th style={{ padding: "10px 14px", fontSize: 10, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Why it works
                </th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => (
                <tr key={i} style={{ borderBottom: i === parts.length - 1 ? "none" : `1px solid ${C.border}`, verticalAlign: "top" }}>
                  <td style={{ padding: "14px" }}>
                    <Badge tone="accent">{p.part}</Badge>
                  </td>
                  <td style={{ padding: "14px", fontSize: 12.5, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap", borderLeft: `2px solid ${C.accent}` }}>
                    {p.framework}
                  </td>
                  <td style={{ padding: "14px", fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>{p.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {whatToChange.length > 0 && (
        <Card style={{ border: `1px solid ${C.warning}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <Replace size={14} color={C.warning} />
            <span className="cl-mono" style={{ fontSize: 10.5, color: C.warning, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Change this to make it yours
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 7 }}>
            {whatToChange.map((item, i) => (
              <li key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>{item}</li>
            ))}
          </ul>
        </Card>
      )}

      {hasDelivery && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <Mic size={14} color={C.accentLight} />
            <span className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              How to shoot it
            </span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {delivery.wardrobe && (
              <div style={{ display: "flex", gap: 10 }}>
                <Shirt size={14} color={C.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
                  <b style={{ color: C.text }}>Wear: </b>
                  {delivery.wardrobe}
                </div>
              </div>
            )}
            {delivery.setting && (
              <div style={{ display: "flex", gap: 10 }}>
                <Camera size={14} color={C.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
                  <b style={{ color: C.text }}>Setting: </b>
                  {delivery.setting}
                </div>
              </div>
            )}

            {delivery.tonality.length > 0 && (
              <div>
                <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600, marginBottom: 8 }}>Tonality, section by section</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {delivery.tonality.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, background: C.surface2, borderRadius: 8, padding: "8px 12px" }}>
                      <span className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, flexShrink: 0, minWidth: 118, paddingTop: 1 }}>
                        {t.section}
                      </span>
                      <span style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55 }}>{t.direction}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
