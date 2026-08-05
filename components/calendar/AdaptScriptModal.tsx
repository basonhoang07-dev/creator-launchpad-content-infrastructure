"use client";

// components/calendar/AdaptScriptModal.tsx
//
// Ported from the prototype's AdaptScriptModal. The prompt-construction logic
// now lives server-side in app/api/claude/adapt-script (identical prompt,
// tested there already) — this component just posts {clientId, brand,
// sourceScript, runNote} and displays the result, plus brand-profile CRUD.

import React, { useState } from "react";
import { AlertCircle, Check, Copy, Shuffle, Loader2 } from "lucide-react";
import { C } from "@/lib/theme";
import { Button, Field, Modal, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { saveBrandProfile } from "@/lib/queries/calendar";
import type { BrandProfile, CalendarEntry } from "@/lib/queries/calendar";
import { useToast, toastMessage } from "@/components/Toast";

export default function AdaptScriptModal({
  clientId,
  brand,
  profile,
  allScripts,
  onSaveProfile,
  onClose,
}: {
  clientId: string;
  brand: string;
  profile: BrandProfile | null;
  allScripts: CalendarEntry[];
  onSaveProfile: (brand: string, profile: BrandProfile) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"profile" | "adapt">(profile ? "adapt" : "profile");
  const [demo1, setDemo1] = useState(profile?.demoScript1 || "");
  const [demo2, setDemo2] = useState(profile?.demoScript2 || "");
  const [demo3, setDemo3] = useState(profile?.demoScript3 || "");
  const [profileNote, setProfileNote] = useState(profile?.productNote || "");

  const [sourceMode, setSourceMode] = useState<"paste" | "existing">("paste");
  const [pastedScript, setPastedScript] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [runNote, setRunNote] = useState("");
  const [adapting, setAdapting] = useState(false);
  const [adaptError, setAdaptError] = useState("");
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  async function saveProfile() {
    if (!demo1.trim() || !demo2.trim() || !demo3.trim()) return;
    try {
      const next: BrandProfile = { demoScript1: demo1, demoScript2: demo2, demoScript3: demo3, productNote: profileNote };
      await saveBrandProfile(createClient(), clientId, brand, next);
      onSaveProfile(brand, next);
      setMode("adapt");
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save the brand profile — try again."));
    }
  }

  const sourceScript = sourceMode === "paste" ? pastedScript : allScripts.find((s) => s.id === selectedExistingId)?.script || "";

  async function runAdapt() {
    if (!sourceScript.trim() || !profile) return;
    setAdaptError("");
    setResult("");
    setAdapting(true);
    try {
      const res = await fetch("/api/claude/adapt-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, brand, sourceScript, runNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Adapt failed");
      setResult(data.result);
    } catch (err) {
      setAdaptError(toastMessage(err, "Couldn't reach Claude — try again in a moment."));
    } finally {
      setAdapting(false);
    }
  }

  function copyResult() {
    navigator.clipboard?.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Modal title={mode === "profile" ? `Set up ${brand}'s brand profile` : `Adapt a script for ${brand}`} onClose={onClose} width={620}>
      {mode === "profile" ? (
        <>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 16, lineHeight: 1.5 }}>
            {profile ? "Update the reference scripts anytime — " : "First time using this on this board — "}
            give Claude 3 examples of how {brand} demos its product. These get saved to this board and reused every time you adapt a script here.
          </div>
          <Field label="Demo script #1 (your best one)">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={demo1} onChange={(e) => setDemo1(e.target.value)} placeholder="Paste your strongest product demo script..." />
          </Field>
          <Field label="Demo script #2 (a different variation)">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={demo2} onChange={(e) => setDemo2(e.target.value)} placeholder="A different angle on demoing the product..." />
          </Field>
          <Field label="Demo script #3 (a different variation)">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={demo3} onChange={(e) => setDemo3(e.target.value)} placeholder="Yet another angle..." />
          </Field>
          <Field label="Product context (optional)">
            <input style={inputStyle} value={profileNote} onChange={(e) => setProfileNote(e.target.value)} placeholder="e.g. mainly pushing the overnight repair serum right now" />
          </Field>
          <Button style={{ width: "100%", justifyContent: "center" }} onClick={saveProfile} disabled={!demo1.trim() || !demo2.trim() || !demo3.trim()}>
            <Check size={14} /> Save & continue
          </Button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Button variant={sourceMode === "paste" ? "primary" : "secondary"} size="sm" onClick={() => setSourceMode("paste")}>Paste a script</Button>
            <Button variant={sourceMode === "existing" ? "primary" : "secondary"} size="sm" onClick={() => setSourceMode("existing")}>Use one of ours</Button>
            <button onClick={() => setMode("profile")} style={{ marginLeft: "auto", background: "none", border: "none", color: C.textFaint, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
              Edit brand profile
            </button>
          </div>

          {sourceMode === "paste" ? (
            <Field label="Source script">
              <textarea style={{ ...inputStyle, minHeight: 130, resize: "vertical" }} value={pastedScript} onChange={(e) => setPastedScript(e.target.value)} placeholder="Paste any script — from Sandcastles, a swipe file, an old winner, anywhere..." />
            </Field>
          ) : (
            <Field label="Pick an existing script">
              <select style={inputStyle} value={selectedExistingId} onChange={(e) => setSelectedExistingId(e.target.value)}>
                <option value="">Select a script...</option>
                {allScripts.map((s) => (
                  <option key={s.id} value={s.id}>{s.brand} — {s.title}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="What's being pushed in this one (optional)">
            <input style={inputStyle} value={runNote} onChange={(e) => setRunNote(e.target.value)} placeholder="e.g. the new travel-size version" />
          </Field>

          <Button style={{ width: "100%", justifyContent: "center", marginBottom: 14 }} onClick={runAdapt} disabled={adapting || !sourceScript.trim()}>
            {adapting ? <Loader2 size={14} className="cl-spin" /> : <Shuffle size={14} />}
            {adapting ? "Adapting..." : `Adapt to ${brand}`}
          </Button>

          {adaptError && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14 }}>
              <AlertCircle size={12} /> {adaptError}
            </div>
          )}

          {result && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="cl-mono" style={{ fontSize: 10.5, color: C.accentLight, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Adapted script</span>
                <Button size="sm" variant="secondary" onClick={copyResult}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, fontSize: 12.5, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }} className="cl-scroll">
                {result}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
