"use client";

// components/ExtensionKeyCard.tsx
//
// Hands out the browser extension's connection key.
//
// Hidden by default and revealed on click, because it's a credential that
// reaches this client's saved references — the same treatment an API key
// gets. Rotating is the only revoke there is: an extension already
// installed somewhere can't be reached to uninstall, so replacing the key
// is what cuts it off.

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, Puzzle, RefreshCw } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, inputStyle } from "@/components/ui";
import { useToast, toastMessage } from "@/components/Toast";

export default function ExtensionKeyCard({ clientId }: { clientId: string | null }) {
  const { showToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`/api/extension/key?clientId=${clientId}`);
      const json = await res.json();
      if (res.ok) setToken(json.token);
    } catch {
      /* leave it unset — the card explains itself without a key */
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function rotate() {
    if (!confirm("Replace this key? Any extension already using the old one will stop working.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/extension/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't replace the key");
      setToken(json.token);
      setRevealed(true);
      showToast("New key generated — paste it into the extension again.", "success");
    } catch (err) {
      showToast(toastMessage(err, "Couldn't replace that key."));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Puzzle size={17} color={C.accentLight} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Browser extension</div>
          <div style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.55, marginTop: 2 }}>
            Flags creators you already track while you scroll Instagram or TikTok, and saves any video into your
            calendar as a reference. Paste this key into the extension once.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          readOnly
          value={token ? (revealed ? token : "•".repeat(28)) : "No key yet"}
          onFocus={(e) => e.currentTarget.select()}
          style={{ ...inputStyle, flex: 1, minWidth: 220, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
        />
        <Button size="sm" variant="secondary" onClick={() => setRevealed((v) => !v)} disabled={!token}>
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          {revealed ? "Hide" : "Reveal"}
        </Button>
        <Button size="sm" variant="secondary" onClick={copy} disabled={!token}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="secondary" onClick={rotate} disabled={busy || !clientId}>
          <RefreshCw size={13} /> {token ? "Replace" : "Generate"}
        </Button>
      </div>

      <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 10, lineHeight: 1.55 }}>
        Treat it like a password — anyone with it can save references into your account. Replacing it is how you cut off
        a copy you no longer control.
      </div>

      {/* The key is useless without the extension, and a client can't clone
          the repo to get it — so the download and the steps live here rather
          than in a doc somewhere. */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <a href="/creator-launchpad-extension.zip" download style={{ textDecoration: "none" }}>
            <Button size="sm"><Download size={13} /> Download the extension</Button>
          </a>
          <span style={{ fontSize: 11, color: C.textFaint }}>Chrome, Edge or Brave · about 6 KB</span>
        </div>

        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: C.textMuted, lineHeight: 1.85 }}>
          <li>Download the zip above and unzip it somewhere you won't delete.</li>
          <li>
            Open <span style={{ fontFamily: "ui-monospace, monospace", color: C.text }}>chrome://extensions</span> and
            turn on <strong>Developer mode</strong>, top right.
          </li>
          <li>Click <strong>Load unpacked</strong> and choose the unzipped folder.</li>
          <li>Click the extension's icon, paste your key from above, and hit Connect.</li>
        </ol>

        <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 10, lineHeight: 1.55 }}>
          It reads the page you're already looking at and saves when you click. It never likes, follows, comments or
          scrolls for you.
        </div>
      </div>
    </Card>
  );
}
