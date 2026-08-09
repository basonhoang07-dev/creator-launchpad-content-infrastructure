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
import { Card, Button, SectionHeader } from "@/components/ui";
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
              ) : (
                <Button size="sm" variant={i.connected ? "secondary" : "primary"} onClick={() => toggle(i.id)}>
                  {i.connected ? "Disconnect" : "Connect"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
