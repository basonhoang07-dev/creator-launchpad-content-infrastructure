"use client";

// app/(dashboard)/integrations/page.tsx — ported from the prototype's IntegrationsPage.

import React, { useCallback, useEffect, useState } from "react";
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
  const [integrations, setIntegrations] = useState<IntegrationMeta[] | null>(null);

  const reload = useCallback(async () => {
    setIntegrations(await fetchIntegrations(createClient(), clientId));
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

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

  if (!integrations) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  return (
    <div>
      <SectionHeader eyebrow="Connect your tools" title="Integrations" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {integrations.map((i) => {
          const isExternal = EXTERNAL_TOOL_URLS[i.id];
          return (
            <Card key={i.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: i.connected || isExternal ? C.accentDim : C.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Plug size={17} color={i.connected || isExternal ? C.accentLight : C.textFaint} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{i.desc}</div>
              </div>
              {isExternal ? (
                <Button size="sm" variant="secondary" onClick={() => window.open(EXTERNAL_TOOL_URLS[i.id], "_blank")}>
                  <ExternalLink size={13} /> Open
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
