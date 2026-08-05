"use client";

// components/ClientPickerModal.tsx
//
// Ported from the prototype's ClientPickerModal. One deliberate improvement
// over the prototype: access grants and "current" comparisons are keyed by
// client id (via account_client_access, a real join table) instead of the
// prototype's client *name* string — the inventory pass flagged brand/client
// name-matching as fragile (no rename cascade). Same UI/behavior otherwise.

import React, { useEffect, useState } from "react";
import { Check, Lock, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { C } from "@/lib/theme";
import { Modal, Badge, EmptyState } from "@/components/ui";
import { useSession, type WorkingClient } from "@/components/SessionProvider";

interface RosterClient {
  id: string;
  name: string;
}

export default function ClientPickerModal({
  currentClientId,
  onSelect,
  onClose,
}: {
  currentClientId: string | null;
  onSelect: (client: WorkingClient) => void;
  onClose: () => void;
}) {
  const { profile } = useSession();
  const [roster, setRoster] = useState<RosterClient[]>([]);
  const [accessibleIds, setAccessibleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin has unrestricted access to every client in the org — enforced
  // server-side (lib/auth.ts's requireClientAccess grants Admin access to
  // any client_id in their org without needing an account_client_access
  // row). Only VA/Editor and Creative Director are actually grant-gated, so
  // skip fetching/checking grants entirely for Admin instead of showing
  // every client as locked.
  const isAdmin = profile.role === "Admin";

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (isAdmin) {
        const { data: clients } = await supabase.from("clients").select("id, name").eq("organization_id", profile.organization_id).order("name");
        setRoster(clients || []);
        setLoading(false);
        return;
      }
      const [{ data: clients }, { data: grants }] = await Promise.all([
        supabase.from("clients").select("id, name").eq("organization_id", profile.organization_id).order("name"),
        supabase.from("account_client_access").select("client_id").eq("profile_id", profile.id),
      ]);
      setRoster(clients || []);
      setAccessibleIds((grants || []).map((g) => g.client_id));
      setLoading(false);
    })();
  }, [profile.organization_id, profile.id, isAdmin]);

  return (
    <Modal title="Choose a client to work in" onClose={onClose} width={440}>
      <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
        {isAdmin ? "Switch into any client's portal — view and edit their KPIs, calendar, and everything else." : "You can see everyone on the roster, but you can only enter portals your Admin has invited you into."}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {roster.map((c) => {
          const hasAccess = isAdmin || accessibleIds.includes(c.id);
          const isCurrent = currentClientId === c.id;
          return (
            <button
              key={c.id}
              disabled={!hasAccess}
              onClick={() => hasAccess && onSelect({ id: c.id, name: c.name })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                background: isCurrent ? C.accentDim : C.surface2,
                border: `1px solid ${isCurrent ? C.accent : C.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                cursor: hasAccess ? "pointer" : "not-allowed",
                opacity: hasAccess ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: C.surface3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {c.name.slice(0, 1)}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: isCurrent ? C.accentLight : C.text }}>{c.name}</span>
              {isCurrent ? (
                <Badge tone="accent">Working here</Badge>
              ) : hasAccess ? (
                <Check size={14} color={C.textFaint} />
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: C.textFaint }}>
                  <Lock size={11} /> Not invited
                </span>
              )}
            </button>
          );
        })}
        {!loading && roster.length === 0 && <EmptyState icon={Users} text="No members on the roster yet." />}
      </div>
    </Modal>
  );
}
