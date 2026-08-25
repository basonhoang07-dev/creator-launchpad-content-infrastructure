"use client";

// app/(dashboard)/integrations/page.tsx — ported from the prototype's IntegrationsPage.
//
// 'drive' and 'gcal' are real OAuth integrations (see lib/google-drive.ts and
// lib/google-calendar.ts) — "Connect" redirects to Google's consent screen
// instead of just flipping a DB flag like the remaining external-tool cards
// still do.

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ExternalLink, Plug } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, SectionHeader, Modal, Field, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { fetchIntegrations, toggleIntegration, EXTERNAL_TOOL_URLS, type IntegrationMeta } from "@/lib/queries/integrations";
import { useToast, toastMessage } from "@/components/Toast";

export default function IntegrationsPage() {
  const clientId = useDefaultScopedClientId();
  return clientId ? <IntegrationsInner clientId={clientId} /> : <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;
}

function IntegrationsInner({ clientId }: { clientId: string }) {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<IntegrationMeta[] | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [showSocialkitModal, setShowSocialkitModal] = useState(false);
  const [socialkitKey, setSocialkitKey] = useState("");
  const [savingSocialkit, setSavingSocialkit] = useState(false);
  const [socialkitError, setSocialkitError] = useState("");

  const reload = useCallback(async () => {
    setIntegrations(await fetchIntegrations(createClient(), clientId));
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // /api/oauth/google/callback and /api/oauth/google-calendar/callback
  // redirect back here with one of these set.
  useEffect(() => {
    const driveEmail = searchParams.get("drive_connected");
    const driveError = searchParams.get("drive_error");
    const gcalEmail = searchParams.get("gcal_connected");
    const gcalError = searchParams.get("gcal_error");
    if (driveEmail) {
      showToast(`Google Drive connected — ${driveEmail}`, "success");
      reload();
      router.replace("/integrations");
    } else if (driveError) {
      showToast(driveError);
      router.replace("/integrations");
    } else if (gcalEmail) {
      showToast(`Google Calendar connected — ${gcalEmail}`, "success");
      reload();
      router.replace("/integrations");
    } else if (gcalError) {
      showToast(gcalError);
      router.replace("/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function toggle(id: string) {
    const current = integrations!.find((i) => i.id === id)!;
    setIntegrations((prev) => prev!.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)));
    try {
      await toggleIntegration(createClient(), clientId, id, !current.connected);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't update that integration — reverting."));
      reload();
    }
  }

  function connectDrive() {
    window.location.href = `/api/oauth/google/start?clientId=${encodeURIComponent(clientId)}`;
  }
  function connectGoogleCalendar() {
    window.location.href = `/api/oauth/google-calendar/start?clientId=${encodeURIComponent(clientId)}`;
  }

  async function saveSocialkitKey() {
    if (!socialkitKey.trim()) return;
    setSocialkitError("");
    setSavingSocialkit(true);
    try {
      const res = await fetch("/api/socialkit/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, apiKey: socialkitKey.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't save that key");
      setShowSocialkitModal(false);
      setSocialkitKey("");
      showToast("SocialKit connected.", "success");
      reload();
    } catch (err) {
      setSocialkitError(toastMessage(err, "Couldn't save that key — try again."));
    } finally {
      setSavingSocialkit(false);
    }
  }

  async function disconnectSocialkit() {
    setDisconnecting("socialkit");
    try {
      const res = await fetch("/api/socialkit/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't disconnect");
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't disconnect SocialKit — try again."));
    } finally {
      setDisconnecting(null);
    }
  }

  async function disconnectGoogleOAuth(id: "drive" | "gcal") {
    setDisconnecting(id);
    try {
      const res = await fetch(id === "drive" ? "/api/drive/disconnect" : "/api/google-calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't disconnect");
      reload();
    } catch (err) {
      showToast(toastMessage(err, `Couldn't disconnect ${id === "drive" ? "Google Drive" : "Google Calendar"} — try again.`));
    } finally {
      setDisconnecting(null);
    }
  }

  if (!integrations) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  return (
    <div>
      <SectionHeader eyebrow="Connect your tools" title="Integrations" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {integrations.map((i) => {
          const isExternal = EXTERNAL_TOOL_URLS[i.id];
          const isGoogleOAuth = i.id === "drive" || i.id === "gcal";
          const isSocialkit = i.id === "socialkit";
          return (
            <Card key={i.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: i.connected || isExternal ? C.accentDim : C.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Plug size={17} color={i.connected || isExternal ? C.accentLight : C.textFaint} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{isGoogleOAuth && i.connected && i.connectedEmail ? `Connected as ${i.connectedEmail}` : i.desc}</div>
              </div>
              {isExternal ? (
                <Button size="sm" variant="secondary" onClick={() => window.open(EXTERNAL_TOOL_URLS[i.id], "_blank")}>
                  <ExternalLink size={13} /> Open
                </Button>
              ) : isGoogleOAuth ? (
                <Button
                  size="sm"
                  variant={i.connected ? "secondary" : "primary"}
                  disabled={disconnecting === i.id}
                  onClick={i.connected ? () => disconnectGoogleOAuth(i.id as "drive" | "gcal") : i.id === "drive" ? connectDrive : connectGoogleCalendar}
                >
                  {i.connected ? (disconnecting === i.id ? "Disconnecting..." : "Disconnect") : "Connect"}
                </Button>
              ) : isSocialkit ? (
                <Button
                  size="sm"
                  variant={i.connected ? "secondary" : "primary"}
                  disabled={disconnecting === i.id}
                  onClick={i.connected ? disconnectSocialkit : () => { setSocialkitError(""); setShowSocialkitModal(true); }}
                >
                  {i.connected ? (disconnecting === i.id ? "Disconnecting..." : "Disconnect") : "Connect"}
                </Button>
              ) : (
                <Button size="sm" variant={i.connected ? "secondary" : "primary"} onClick={() => toggle(i.id)}>
                  {i.connected ? "Disconnect" : "Connect"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {showSocialkitModal && (
        <Modal title="Connect SocialKit" onClose={() => setShowSocialkitModal(false)} width={460}>
          <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
            This powers <b style={{ color: C.text }}>"Break down this reference"</b> on a script — paste a reference
            Instagram Reel or TikTok and get its full transcript plus a framework breakdown.
          </div>
          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 6 }}>
                <b style={{ color: C.accentLight }}>1.</b> Sign up free at{" "}
                <a href="https://socialkit.dev" target="_blank" rel="noopener noreferrer" style={{ color: C.accentLight }}>
                  socialkit.dev
                </a>{" "}
                — no card needed, 20 breakdowns a month.
              </div>
              <div style={{ marginBottom: 6 }}>
                <b style={{ color: C.accentLight }}>2.</b> Copy your API key from their dashboard.
              </div>
              <div>
                <b style={{ color: C.accentLight }}>3.</b> Paste it below.
              </div>
            </div>
          </div>
          <Field label="SocialKit API key">
            <input
              style={inputStyle}
              value={socialkitKey}
              onChange={(e) => setSocialkitKey(e.target.value)}
              placeholder="Paste your key here"
              autoFocus
            />
          </Field>
          {socialkitError && (
            <div style={{ fontSize: 11.5, color: C.danger, marginBottom: 14 }}>{socialkitError}</div>
          )}
          <Button
            style={{ width: "100%", justifyContent: "center" }}
            onClick={saveSocialkitKey}
            disabled={savingSocialkit || !socialkitKey.trim()}
          >
            {savingSocialkit ? "Saving..." : "Connect"}
          </Button>
        </Modal>
      )}
    </div>
  );
}
