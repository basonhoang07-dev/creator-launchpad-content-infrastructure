"use client";

// components/recaps/NewRecapModal.tsx
//
// Ported from the prototype's NewRecapModal, adapted to the real
// /api/claude/generate-recap route, which generates AND persists the recap
// (+ action items + decisions) in one server-side step — so this is a single
// "Generate recap" action rather than the prototype's separate generate-then-
// edit-then-save flow. The attendee-email match is kept as an informational
// check (same matching logic the real Fathom webhook would use), since the
// target client is already fixed to the portal you're working in.

import React, { useState } from "react";
import { AlertCircle, Check, Loader2, Wand2 } from "lucide-react";
import { C } from "@/lib/theme";
import { Button, Field, Modal, inputStyle } from "@/components/ui";
import { todayPlus } from "@/lib/helpers";
import { matchesClientMeetEmail } from "@/lib/queries/recaps";
import { toastMessage } from "@/components/Toast";

export default function NewRecapModal({
  clientId,
  clientName,
  clientMeetEmail,
  onSaved,
  onClose,
}: {
  clientId: string;
  clientName: string;
  clientMeetEmail: string | null;
  onSaved: (recapId: string) => void;
  onClose: () => void;
}) {
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [callDate, setCallDate] = useState(todayPlus(0));
  const [recordingUrl, setRecordingUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const matched = matchesClientMeetEmail(attendeeEmail, clientMeetEmail);

  async function generate() {
    if (!transcript.trim()) return;
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/claude/generate-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientName, transcript, callDate, recordingUrl: recordingUrl || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generate failed");
      onSaved(json.recap.id);
    } catch (err) {
      setError(toastMessage(err, "Couldn't generate the recap — try again in a moment."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal title="New call recap" onClose={onClose} width={560}>
      <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 16, lineHeight: 1.5 }}>
        Paste the call transcript — Claude turns it into a title, summary, action items, and locked-in decisions.
      </div>

      <Field label="Attendee email — who was on the call">
        <input style={inputStyle} value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} placeholder="client@example.com" />
      </Field>
      {attendeeEmail.trim() &&
        (matched ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.success, marginBottom: 14, marginTop: -8 }}>
            <Check size={12} /> Matches {clientName}'s Meet email — this is exactly how the real webhook pipeline would match it automatically.
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.warning, marginBottom: 14, marginTop: -8 }}>
            <AlertCircle size={12} /> Doesn't match {clientName}'s Meet email on file — the recap will still save to this portal.
          </div>
        ))}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
        <Field label="Client">
          <input style={{ ...inputStyle, opacity: 0.7 }} value={clientName} disabled />
        </Field>
        <Field label="Call date">
          <input type="date" style={inputStyle} value={callDate} onChange={(e) => setCallDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Recording link (optional)">
        <input style={inputStyle} value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="Fathom / Drive link to the recording" />
      </Field>
      <Field label="Transcript">
        <textarea style={{ ...inputStyle, minHeight: 160, resize: "vertical" }} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the full call transcript here..." />
      </Field>
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14 }}>
          <AlertCircle size={12} /> {error}
        </div>
      )}
      <Button style={{ width: "100%", justifyContent: "center" }} onClick={generate} disabled={generating || !transcript.trim()}>
        {generating ? <Loader2 size={14} className="cl-spin" /> : <Wand2 size={14} />}
        {generating ? "Generating..." : "Generate recap"}
      </Button>
    </Modal>
  );
}
