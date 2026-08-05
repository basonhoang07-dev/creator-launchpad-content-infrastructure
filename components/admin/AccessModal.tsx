"use client";

import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { C } from "@/lib/theme";
import { Modal, Badge, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { fetchClientRoster, fetchAccessGrants, grantClientAccess, revokeClientAccess, type AdminAccount, type RosterClient } from "@/lib/queries/admin";
import { useToast, toastMessage } from "@/components/Toast";

export default function AccessModal({ account, organizationId, onClose }: { account: AdminAccount; organizationId: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [roster, setRoster] = useState<RosterClient[]>([]);
  const [granted, setGranted] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const [clients, grants] = await Promise.all([fetchClientRoster(supabase, organizationId), fetchAccessGrants(supabase, account.id)]);
        setRoster(clients);
        setGranted(grants);
      } catch (err) {
        showToast(toastMessage(err, "Couldn't load client access — try again."));
      }
    })();
  }, [account.id, organizationId]);

  async function toggle(clientId: string) {
    try {
      const supabase = createClient();
      const has = granted.includes(clientId);
      if (has) {
        await revokeClientAccess(supabase, account.id, clientId);
        setGranted((prev) => prev.filter((c) => c !== clientId));
      } else {
        await grantClientAccess(supabase, account.id, clientId);
        setGranted((prev) => [...prev, clientId]);
      }
    } catch (err) {
      showToast(toastMessage(err, "Couldn't update access — try again."));
    }
  }

  return (
    <Modal title={`Client access — ${account.name}`} onClose={onClose} width={460}>
      <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
        {account.role} sees the full member list, but can only enter portals you've checked below. Unchecked clients show as locked until invited.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {roster.map((c) => {
          const has = granted.includes(c.id);
          return (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
              <input type="checkbox" checked={has} onChange={() => toggle(c.id)} />
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {c.name.slice(0, 1)}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{c.name}</span>
              {has ? <Badge tone="success">Granted</Badge> : <Badge>Locked</Badge>}
            </label>
          );
        })}
        {roster.length === 0 && <EmptyState icon={Users} text="No members on the roster yet." />}
      </div>
    </Modal>
  );
}
