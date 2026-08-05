"use client";

// components/admin/RecapDeliveryPanel.tsx
//
// Everything that makes automatic recap delivery work, for every client, in
// one table: the Google Meet email that matches an incoming Fathom call to
// a client, and which Discord channel it posts to. Replaces the old
// per-client "Recap delivery" modal (Admin Panel → Accounts → open a
// client → edit → save → close, repeat for each one) — with 19+ real
// clients that didn't scale. This is the one place to manage it.

import React, { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, InfoTooltip } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import {
  fetchClientRecapMappings, updateClientRecapMapping, fetchDiscordChannels,
  type ClientRecapMapping, type DiscordChannel,
} from "@/lib/queries/admin";
import { normalizeChannelName } from "@/lib/discord";
import { useToast, toastMessage } from "@/components/Toast";

interface RowEdits {
  googleMeetEmail: string;
  discordChannelId: string;
}

export default function RecapDeliveryPanel({ organizationId }: { organizationId: string }) {
  const { showToast } = useToast();
  const [clients, setClients] = useState<ClientRecapMapping[] | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [pending, setPending] = useState<Record<string, RowEdits>>({}); // clientId -> unsaved edits
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  const load = React.useCallback(async () => {
    setLoadError("");
    try {
      const supabase = createClient();
      const [clientRows, channelRows] = await Promise.all([
        fetchClientRecapMappings(supabase, organizationId),
        fetchDiscordChannels(),
      ]);
      setClients(clientRows);
      setChannels(channelRows);
      setPending({});
    } catch (err) {
      setLoadError(toastMessage(err, "Couldn't load the client list — try again."));
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  function bestGuessId(clientName: string): string {
    const target = normalizeChannelName(clientName);
    return channels.find((c) => normalizeChannelName(c.name) === target)?.id || "";
  }

  function edit(client: ClientRecapMapping, patch: Partial<RowEdits>) {
    setPending((prev) => {
      const base: RowEdits = prev[client.id] || { googleMeetEmail: client.googleMeetEmail, discordChannelId: client.discordChannelId };
      return { ...prev, [client.id]: { ...base, ...patch } };
    });
  }

  async function save(client: ClientRecapMapping) {
    const edits = pending[client.id];
    if (!edits) return;
    setSavingId(client.id);
    try {
      await updateClientRecapMapping(createClient(), client.id, edits);
      setClients((prev) => (prev ? prev.map((c) => (c.id === client.id ? { ...c, ...edits } : c)) : prev));
      setPending((prev) => {
        const next = { ...prev };
        delete next[client.id];
        return next;
      });
    } catch (err) {
      showToast(toastMessage(err, "Couldn't save that client's settings — try again."));
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.googleMeetEmail.toLowerCase().includes(q));
  }, [clients, search]);

  if (loadError) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: C.danger, marginBottom: 12 }}>{loadError}</div>
        <Button size="sm" variant="secondary" onClick={load}>
          <RefreshCw size={13} /> Retry
        </Button>
      </Card>
    );
  }
  if (!clients) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Recap delivery</div>
          <InfoTooltip
            width={280}
            text={`Every client, in one place: the email that matches their Fathom calls, and which Discord channel their recap posts to. "Auto-detect" re-matches the channel by name every time a recap sends — pick a specific one to lock it in for a nicknamed channel that won't match a real name.`}
          />
        </div>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>
      {channels.length === 0 && (
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
          Discord's channel list isn't loading — check DISCORD_BOT_TOKEN and DISCORD_SUPPORT_CATEGORY_ID in .env.local.
        </div>
      )}

      {clients.length > 5 && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={14} color={C.textFaint} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or email..."
            style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px 8px 32px", color: C.text, fontSize: 13 }}
          />
        </div>
      )}

      {clients.length === 0 ? (
        <div style={{ fontSize: 13, color: C.textFaint, padding: "16px 0" }}>
          No clients yet — client records get created automatically once someone's access request is approved (Accounts tab), not added manually here.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: C.textFaint, padding: "16px 0" }}>No clients match "{search}".</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr auto", gap: 10, fontSize: 11, color: C.textFaint, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em", padding: "0 2px" }}>
            <div>Client</div>
            <div>Google Meet email</div>
            <div>Discord channel</div>
            <div />
          </div>
          {filtered.map((client) => {
            const guess = bestGuessId(client.name);
            const edits = pending[client.id];
            const email = edits?.googleMeetEmail ?? client.googleMeetEmail;
            const channelId = edits?.discordChannelId ?? client.discordChannelId;
            const dirty = !!edits && (edits.googleMeetEmail !== client.googleMeetEmail || edits.discordChannelId !== client.discordChannelId);
            return (
              <div key={client.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr auto", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={client.name}>
                  {client.name}
                </div>
                <input
                  style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13 }}
                  value={email}
                  onChange={(e) => edit(client, { googleMeetEmail: e.target.value })}
                  placeholder="client@example.com"
                />
                {channels.length > 0 ? (
                  <select
                    style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13 }}
                    value={channelId}
                    onChange={(e) => edit(client, { discordChannelId: e.target.value })}
                  >
                    <option value="">{guess ? "Auto-detect (recommended)" : "Auto-detect — no name match, pick one"}</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.id === guess ? " (name match)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13 }}
                    value={channelId}
                    onChange={(e) => edit(client, { discordChannelId: e.target.value })}
                    placeholder="Channel ID"
                  />
                )}
                <Button size="sm" disabled={!dirty || savingId === client.id} onClick={() => save(client)}>
                  <Check size={13} /> {savingId === client.id ? "Saving..." : "Save"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
