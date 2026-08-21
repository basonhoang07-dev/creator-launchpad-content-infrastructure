"use client";

import React from "react";
import { Check, ChevronLeft, Play } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button } from "@/components/ui";
import { parseDateOnly } from "@/lib/helpers";
import type { Recap } from "@/lib/queries/recaps";

export default function RecapDetailView({ recap, onToggleItem, onBack }: { recap: Recap; onToggleItem: (itemId: string) => void; onBack: () => void }) {
  const done = recap.actionItems.filter((i) => i.done).length;
  const total = recap.actionItems.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: C.textFaint, fontSize: 12, cursor: "pointer", marginBottom: 6, padding: 0 }}>
        <ChevronLeft size={14} /> Back to Recaps
      </button>
      <div className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginBottom: 16 }}>Recaps · {recap.title}</div>

      <div style={{ background: `linear-gradient(160deg, ${C.surface2}, ${C.bg})`, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Creator Launchpad · Call Recap
        </div>
        <h1 className="cl-display" style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>{recap.title}</h1>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 16 }}>
          {parseDateOnly(recap.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        </div>
        {recap.recordingUrl ? (
          <a href={recap.recordingUrl} target="_blank" rel="noopener noreferrer">
            <Button><Play size={14} /> Watch recording</Button>
          </a>
        ) : (
          <Button disabled variant="secondary"><Play size={14} /> No recording linked</Button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>TL;DR</div>
            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, borderLeft: `2px solid ${C.accent}`, paddingLeft: 14 }}>{recap.tldr}</div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Your action items</div>
              <span className="cl-mono" style={{ fontSize: 11, color: C.textMuted }}>{done} / {total} done</span>
            </div>
            <div style={{ width: "100%", height: 6, background: C.surface3, borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: C.success, borderRadius: 4, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {recap.actionItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onToggleItem(item.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", width: "100%" }}
                >
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                      background: item.done ? C.success : "transparent",
                      border: `1.5px solid ${item.done ? C.success : C.borderLight}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {item.done && <Check size={12} color="#08130D" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: item.done ? C.textFaint : C.text, textDecoration: item.done ? "line-through" : "none" }}>
                    {item.text}
                    {item.due && (
                      <span className="cl-mono" style={{ marginLeft: 8, fontSize: 10.5, color: C.accentLight, fontWeight: 700, textDecoration: "none" }}>
                        Due {item.due}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {recap.actionItems.length === 0 && <div style={{ fontSize: 12.5, color: C.textFaint }}>No action items from this call.</div>}
            </div>
          </Card>
        </div>

        <Card>
          <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Decisions locked</div>
          <div style={{ display: "grid", gap: 10 }}>
            {recap.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Check size={14} color={C.success} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{d}</span>
              </div>
            ))}
            {recap.decisions.length === 0 && <div style={{ fontSize: 12.5, color: C.textFaint }}>No decisions logged.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
