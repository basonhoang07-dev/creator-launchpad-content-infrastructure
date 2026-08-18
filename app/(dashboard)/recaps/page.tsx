"use client";

// app/(dashboard)/recaps/page.tsx — Call Recaps
//
// Ported from the prototype's RecapsPage. Deep link comes from ?recap= query
// param instead of in-memory jumpTo state.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, SectionHeader, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { parseDateOnly } from "@/lib/helpers";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { fetchRecaps, toggleActionItem, type Recap } from "@/lib/queries/recaps";
import NewRecapModal from "@/components/recaps/NewRecapModal";
import RecapDetailView from "@/components/recaps/RecapDetailView";
import { useToast, toastMessage } from "@/components/Toast";

export default function RecapsPage() {
  const { profile, isAdmin } = useSession();
  const clientId = useDefaultScopedClientId();

  if (profile.role !== "Client" && !isAdmin) {
    return <EmptyState icon={MessageSquare} text="Call Recaps is only available to Client and Admin accounts." />;
  }

  return clientId ? <RecapsInner clientId={clientId} /> : <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;
}

function RecapsInner({ clientId }: { clientId: string }) {
  const { isAdmin } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recaps, setRecaps] = useState<Recap[] | null>(null);
  const [clientInfo, setClientInfo] = useState<{ name: string; googleMeetEmail: string | null } | null>(null);
  const [activeRecapId, setActiveRecapId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [jumpApplied, setJumpApplied] = useState(false);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [list, { data: client }] = await Promise.all([
      fetchRecaps(supabase, clientId),
      supabase.from("clients").select("name, google_meet_email").eq("id", clientId).single(),
    ]);
    setRecaps(list);
    if (client) setClientInfo({ name: client.name, googleMeetEmail: client.google_meet_email });
    return list;
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!recaps || jumpApplied) return;
    setJumpApplied(true);
    const recapId = searchParams.get("recap");
    if (recapId) {
      setActiveRecapId(recapId);
      router.replace("/recaps");
    }
  }, [recaps, jumpApplied, searchParams, router]);

  if (!recaps || !clientInfo) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  const sorted = [...recaps].sort((a, b) => b.date.localeCompare(a.date));
  const activeRecap = sorted.find((r) => r.id === activeRecapId);

  async function toggleItem(itemId: string) {
    const item = activeRecap?.actionItems.find((i) => i.id === itemId);
    if (!item) return;
    setRecaps((prev) => prev!.map((r) => (r.id !== activeRecapId ? r : { ...r, actionItems: r.actionItems.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) })));
    try {
      await toggleActionItem(createClient(), itemId, !item.done);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that — reverting."));
      reload();
    }
  }

  if (activeRecap) {
    return <RecapDetailView recap={activeRecap} onToggleItem={toggleItem} onBack={() => setActiveRecapId(null)} />;
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Every call, captured"
        title="Call Recaps"
        action={isAdmin ? <Button size="sm" onClick={() => setShowNew(true)}><Plus size={14} /> New recap</Button> : undefined}
      />
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 20, maxWidth: 560 }}>
        Every call — action items, decisions, and the recording. Action items land in Needs You Now automatically until they're checked off here.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {sorted.map((r) => {
          const done = r.actionItems.filter((i) => i.done).length;
          const total = r.actionItems.length;
          const pct = total > 0 ? (done / total) * 100 : 100;
          const isDone = total > 0 && done === total;
          return (
            <Card key={r.id} onClick={() => setActiveRecapId(r.id)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Badge tone={isDone ? "success" : "accent"}>{isDone ? "Done" : "In progress"}</Badge>
                <span className="cl-mono" style={{ fontSize: 11, color: C.textFaint }}>{parseDateOnly(r.date).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {r.tldr}
              </div>
              {total > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 5, background: C.surface3, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: C.success, borderRadius: 3 }} />
                  </div>
                  <span className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint }}>{Math.round(pct)}%</span>
                </div>
              )}
            </Card>
          );
        })}
        {sorted.length === 0 && <EmptyState icon={MessageSquare} text="No call recaps yet." />}
      </div>

      {showNew && (
        <NewRecapModal
          clientId={clientId}
          clientName={clientInfo.name}
          clientMeetEmail={clientInfo.googleMeetEmail}
          onSaved={async (recapId) => {
            await reload();
            setShowNew(false);
            setActiveRecapId(recapId);
          }}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
