"use client";

// app/(dashboard)/admin/page.tsx — Admin Panel
//
// Ported from the prototype's AdminPanel. Real differences from the
// prototype, all noted inline where they happen: invite + Danger Zone go
// through server routes (service-role key required); "Recap delivery"
// settings save to the linked `clients` row instead of the account, since
// google_meet_email/discord_webhook_url live there in the real schema; the
// Check-ins roster reuses the same live community computation as Home's
// Community Overview instead of the prototype's mock data.community; and
// the `viewingLog` bug (referenced in the prototype's Check-ins tab but
// never declared) is fixed by actually declaring the state.

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Check, ChevronRight, Megaphone, ShieldCheck, Star, Trash2, UserPlus, Users, Wallet, X,
} from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Badge, Button, Field, Modal, SectionHeader, EmptyState, inputStyle, Avatar } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import { formatWeekLabel, getWeekKey, type WeeklyLog } from "@/lib/helpers";
import {
  fetchAccounts, removeAccount, postAnnouncement, addClient,
  fetchWeeklyLogHistory, fetchAccessRequests, approveAccessRequest, denyAccessRequest,
  type AdminAccount, type AccessRequest,
} from "@/lib/queries/admin";
import { fetchCommunityOverview, type CommunityData } from "@/lib/queries/community";
import CheckInDetailModal from "@/components/CheckInDetailModal";
import AccessModal from "@/components/admin/AccessModal";
import RecapDeliveryPanel from "@/components/admin/RecapDeliveryPanel";
import ViralFeedPanel from "@/components/admin/ViralFeedPanel";
import LeadsPanel from "@/components/admin/LeadsPanel";
import { useToast, toastMessage } from "@/components/Toast";

type Tab = "accounts" | "checkins" | "recap" | "viralfeed" | "leads" | "announcement" | "danger";

// The page itself had no role gate at all — a non-Admin who simply typed
// /admin got the full component and whatever its own (mostly org-scoped,
// not Admin-scoped) RLS-permitted queries returned. Gated here the same way
// KPI Trackers/Leaderboard already gate their own role restrictions,
// checked before any of AdminPanelInner's other hooks run. Uses
// effectiveRole (not profile.role) so it also closes while a real Admin is
// previewing a client via "Working in" — that client never sees this page,
// so neither should the preview.
export default function AdminPanel() {
  const { effectiveRole } = useSession();
  if (effectiveRole !== "Admin") {
    return <EmptyState icon={ShieldCheck} text="Admin Panel is only available to Admin accounts." />;
  }
  return <AdminPanelInner />;
}

function AdminPanelInner() {
  const { profile, signOut } = useSession();
  const { showToast } = useToast();
  const defaultClientId = useDefaultScopedClientId();

  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState("");
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [logHistory, setLogHistory] = useState<WeeklyLog[] | null>(null);
  const [viewingLog, setViewingLog] = useState<WeeklyLog | null>(null);

  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "VA/Editor" as "VA/Editor" | "Creative Director" });
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientForm, setAddClientForm] = useState({ name: "", email: "" });
  const [addClientError, setAddClientError] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [accessAccount, setAccessAccount] = useState<AdminAccount | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  const reloadAccounts = useCallback(async () => {
    const supabase = createClient();
    const [accts, requests] = await Promise.all([
      fetchAccounts(supabase, profile.organization_id),
      fetchAccessRequests(supabase, profile.organization_id),
    ]);
    setAccounts(accts);
    setAccessRequests(requests);
  }, [profile.organization_id]);

  useEffect(() => {
    reloadAccounts();
  }, [reloadAccounts]);

  useEffect(() => {
    if (tab !== "checkins") return;
    (async () => {
      const supabase = createClient();
      const [comm, logs] = await Promise.all([
        fetchCommunityOverview(supabase, profile.organization_id),
        defaultClientId ? fetchWeeklyLogHistory(supabase, defaultClientId) : Promise.resolve([]),
      ]);
      setCommunity(comm);
      setLogHistory(logs);
    })();
  }, [tab, profile.organization_id, defaultClientId]);

  async function handleApproveRequest(id: string) {
    setApprovingId(id);
    try {
      await approveAccessRequest(id);
      reloadAccounts();
      showToast("Approved — they'll get an email to set their password.", "success");
    } catch (err) {
      showToast(toastMessage(err, "Couldn't approve that request — try again."));
    } finally {
      setApprovingId(null);
    }
  }
  const [loadingClientLogId, setLoadingClientLogId] = useState<string | null>(null);
  async function handleViewClientCheckIn(clientId: string) {
    setLoadingClientLogId(clientId);
    try {
      const logs = await fetchWeeklyLogHistory(createClient(), clientId);
      const thisWeek = logs.find((l) => l.weekOf === getWeekKey());
      if (!thisWeek) {
        showToast("No check-in submitted yet for this client this week.");
        return;
      }
      setViewingLog(thisWeek);
    } catch (err) {
      showToast(toastMessage(err, "Couldn't load that client's check-in — try again."));
    } finally {
      setLoadingClientLogId(null);
    }
  }
  async function handleDenyRequest(id: string) {
    try {
      await denyAccessRequest(createClient(), id);
      reloadAccounts();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't deny that request — try again."));
    }
  }
  async function handleRemove(id: string) {
    setAccountsError("");
    try {
      const result = await removeAccount(id);
      if (result.warning) setAccountsError(result.warning);
    } catch (err: any) {
      setAccountsError(err.message || "Couldn't remove the account");
    }
    reloadAccounts();
  }

  async function handleInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) return;
    setInviteError("");
    setInviting(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invite failed");
      setInviteForm({ name: "", email: "", role: "VA/Editor" });
      setShowInvite(false);
      reloadAccounts();
    } catch (err: any) {
      setInviteError(err.message || "Couldn't send the invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleAddClient() {
    if (!addClientForm.name.trim() || !addClientForm.email.trim()) return;
    setAddClientError("");
    setAddingClient(true);
    try {
      await addClient(addClientForm.name.trim(), addClientForm.email.trim());
      setAddClientForm({ name: "", email: "" });
      setShowAddClient(false);
      reloadAccounts();
      showToast("Client added — they'll get an email to set their password.", "success");
    } catch (err: any) {
      setAddClientError(err.message || "Couldn't add that client.");
    } finally {
      setAddingClient(false);
    }
  }

  async function handlePostAnnouncement() {
    if (!announcementDraft.trim()) return;
    try {
      await postAnnouncement(createClient(), profile.organization_id, announcementDraft.trim());
      setAnnouncementDraft("");
      showToast("Announcement posted.", "success");
    } catch (err) {
      showToast(toastMessage(err, "Couldn't post that announcement — try again."));
    }
  }

  async function resetToDefaults() {
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset-data", { method: "POST" });
      if (!res.ok) throw new Error("Reset failed — try again.");
      setShowResetConfirm(false);
      setResetConfirmText("");
      await signOut();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't reset the data — try again."));
    } finally {
      setResetting(false);
    }
  }

  if (!accounts) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  return (
    <div>
      <SectionHeader
        eyebrow="You're in control"
        title="Admin Panel"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Button variant={tab === "accounts" ? "primary" : "secondary"} size="sm" onClick={() => setTab("accounts")}>Accounts</Button>
            <Button variant={tab === "checkins" ? "primary" : "secondary"} size="sm" onClick={() => setTab("checkins")}>Check-ins</Button>
            <Button variant={tab === "recap" ? "primary" : "secondary"} size="sm" onClick={() => setTab("recap")}>Recap Delivery</Button>
            <Button variant={tab === "viralfeed" ? "primary" : "secondary"} size="sm" onClick={() => setTab("viralfeed")}>Viral Feed</Button>
            <Button variant={tab === "leads" ? "primary" : "secondary"} size="sm" onClick={() => setTab("leads")}>Leads</Button>
            <Button variant={tab === "announcement" ? "primary" : "secondary"} size="sm" onClick={() => setTab("announcement")}>Announcement</Button>
            <Button variant={tab === "danger" ? "primary" : "secondary"} size="sm" onClick={() => setTab("danger")}>Danger Zone</Button>
          </div>
        }
      />

      {tab === "accounts" && (
        <div style={{ display: "grid", gap: 20 }}>
          {accountsError && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(229,72,77,0.1)", border: `1px solid ${C.danger}`, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.text }}>
              <AlertCircle size={15} color={C.danger} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{accountsError}</span>
              <button onClick={() => setAccountsError("")} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><X size={14} /></button>
            </div>
          )}
          {accessRequests.length > 0 && (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <UserPlus size={15} /> Pending requests ({accessRequests.length})
              </div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 12 }}>
                No account exists yet for any of these — approving creates their login and sends them an email to set a password.
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {accessRequests.map((r) => (
                  <div key={r.id} style={{ background: C.surface2, borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>{r.email}</div>
                    </div>
                    <Button size="sm" onClick={() => handleApproveRequest(r.id)} disabled={approvingId === r.id}>
                      <Check size={13} /> {approvingId === r.id ? "Approving..." : "Approve"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDenyRequest(r.id)} disabled={approvingId === r.id}>
                      <X size={13} /> Deny
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={15} /> All accounts ({accounts.length})
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button size="sm" onClick={() => setShowAddClient(true)}><UserPlus size={13} /> Add client</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowInvite(true)}><UserPlus size={13} /> Invite team member</Button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {accounts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", rowGap: 8 }}>
                  <Avatar name={a.name} avatarUrl={a.avatarUrl} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 11.5, color: C.textMuted }}>{a.email}</div>
                  </div>
                  <Badge tone={a.role === "Admin" || a.role === "Creative Director" ? "accent" : "default"}>{a.role}</Badge>
                  {(a.role === "VA/Editor" || a.role === "Creative Director") && (
                    <Button size="sm" variant="secondary" onClick={() => setAccessAccount(a)}>
                      <Users size={12} /> Access
                    </Button>
                  )}
                  {a.role !== "Admin" && (
                    <button onClick={() => handleRemove(a.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "checkins" && (
        <div style={{ display: "grid", gap: 20 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <Star size={15} /> This week's check-ins
            </div>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Who's submitted their weekly check-in so far — click anyone Submitted to read it, chase down anyone still marked Missing.</div>
            <div style={{ display: "grid", gap: 8 }}>
              {[...(community?.clients || [])]
                .sort((a, b) => (a.checkedInThisWeek === b.checkedInThisWeek ? 0 : a.checkedInThisWeek ? 1 : -1))
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => c.checkedInThisWeek && handleViewClientCheckIn(c.id)}
                    disabled={!c.checkedInThisWeek || loadingClientLogId === c.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, background: C.surface2, border: "none", borderRadius: 10, padding: 12,
                      width: "100%", textAlign: "left", cursor: c.checkedInThisWeek ? "pointer" : "default",
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {c.name.slice(0, 1)}
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, color: C.text }}>{c.name}</span>
                    {c.checkedInThisWeek ? <Badge tone="success">Submitted</Badge> : <Badge tone="warning">Missing</Badge>}
                    {c.checkedInThisWeek && <ChevronRight size={15} color={C.textFaint} />}
                  </button>
                ))}
              {(!community || community.clients.length === 0) && <EmptyState icon={Star} text="No members on the roster yet." />}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>This portal's check-in history</div>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>Full submitted content for the client whose portal you're currently in — click any week to read it.</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(logHistory || []).map((log) => {
                const cash = log.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0) + (log.ugcOneOff || 0);
                return (
                  <button
                    key={log.id}
                    onClick={() => setViewingLog(log)}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, border: "none", borderRadius: 10, padding: 12, cursor: "pointer", textAlign: "left", width: "100%" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Week of {formatWeekLabel(log.weekOf)}</div>
                      <div className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
                        ${cash.toLocaleString()}{log.energyLevel != null ? ` · Energy ${log.energyLevel}/10` : ""}
                      </div>
                    </div>
                    <ChevronRight size={15} color={C.textFaint} />
                  </button>
                );
              })}
              {(!logHistory || logHistory.length === 0) && <EmptyState icon={Wallet} text="No check-ins logged yet." />}
            </div>
          </Card>

          {viewingLog && <CheckInDetailModal log={viewingLog} onClose={() => setViewingLog(null)} />}
        </div>
      )}

      {tab === "recap" && <RecapDeliveryPanel organizationId={profile.organization_id} />}

      {tab === "viralfeed" && <ViralFeedPanel />}

      {tab === "leads" && <LeadsPanel />}

      {tab === "announcement" && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Post an announcement</div>
          <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={announcementDraft} onChange={(e) => setAnnouncementDraft(e.target.value)} />
          <div style={{ fontSize: 11.5, color: C.textFaint, margin: "8px 0 14px" }}>Shown to every user until replaced by the next one.</div>
          <Button onClick={handlePostAnnouncement}><Megaphone size={14} /> Post announcement</Button>
        </Card>
      )}

      {tab === "danger" && (
        <Card style={{ border: `1px solid ${C.danger}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertCircle size={16} color={C.danger} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.danger }}>Reset all content data</div>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
            Wipes every calendar entry, campaign, weekly log, SOP, recap, and announcement for your organization's clients. This cannot be undone. Accounts and client records themselves are
            <b style={{ color: C.text }}> not</b> deleted — real logins can't be safely reset the way the prototype's mock data was. You'll be signed out afterward.
          </div>
          <Button variant="danger" onClick={() => setShowResetConfirm(true)}>
            <Trash2 size={14} /> Reset all content data
          </Button>
        </Card>
      )}

      {showResetConfirm && (
        <Modal title="Reset all content data — are you sure?" onClose={() => { setShowResetConfirm(false); setResetConfirmText(""); }} width={420}>
          <div style={{ fontSize: 12.5, color: C.text, marginBottom: 16, lineHeight: 1.6 }}>
            This permanently deletes every script, campaign, weekly log, SOP, and recap currently saved. Type <b>RESET</b> below to confirm.
          </div>
          <Field label="Type RESET to confirm">
            <input style={inputStyle} value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="RESET" autoFocus />
          </Field>
          <Button variant="danger" style={{ width: "100%", justifyContent: "center" }} onClick={resetToDefaults} disabled={resetConfirmText !== "RESET" || resetting}>
            <Trash2 size={14} /> {resetting ? "Resetting..." : "Permanently reset"}
          </Button>
        </Modal>
      )}

      {showInvite && (
        <Modal title="Invite team member" onClose={() => setShowInvite(false)} width={420}>
          <Field label="Role">
            <select style={inputStyle} value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}>
              <option value="VA/Editor">VA / Editor</option>
              <option value="Creative Director">Creative Director</option>
            </select>
          </Field>
          <Field label="Name">
            <input style={inputStyle} value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input style={inputStyle} value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
          </Field>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14 }}>
            {inviteForm.role === "Creative Director"
              ? 'Format SOPs they publish will be labelled "Creative Director — [their name]" automatically.'
              : "They'll show up as an assignable editor once you grant them access to a client below."}
          </div>
          {inviteError && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14 }}>
              <AlertCircle size={12} /> {inviteError}
            </div>
          )}
          <Button style={{ width: "100%", justifyContent: "center" }} onClick={handleInvite} disabled={inviting}>
            {inviting ? "Sending..." : "Send invite"}
          </Button>
        </Modal>
      )}

      {showAddClient && (
        <Modal title="Add client" onClose={() => setShowAddClient(false)} width={420}>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
            Creates their account immediately and emails them a link to set their password — no request/approval step needed since you already know who they are.
          </div>
          <Field label="Name">
            <input style={inputStyle} value={addClientForm.name} onChange={(e) => setAddClientForm({ ...addClientForm, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Email">
            <input style={inputStyle} value={addClientForm.email} onChange={(e) => setAddClientForm({ ...addClientForm, email: e.target.value })} placeholder="client@example.com" />
          </Field>
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.5 }}>
            This becomes their Google Meet email for matching Fathom calls too — you can change it later in the Recap Delivery tab.
          </div>
          {addClientError && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.danger, marginBottom: 14 }}>
              <AlertCircle size={12} /> {addClientError}
            </div>
          )}
          <Button style={{ width: "100%", justifyContent: "center" }} onClick={handleAddClient} disabled={addingClient}>
            {addingClient ? "Adding..." : "Add client"}
          </Button>
        </Modal>
      )}

      {accessAccount && <AccessModal account={accessAccount} organizationId={profile.organization_id} onClose={() => setAccessAccount(null)} />}
    </div>
  );
}
