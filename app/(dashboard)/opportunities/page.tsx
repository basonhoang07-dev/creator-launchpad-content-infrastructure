"use client";

// app/(dashboard)/opportunities/page.tsx — Brand Deals
//
// Every open brand offer, pulled out of the Discord channels they're posted
// in. Discord is still where deals arrive; the problem it doesn't solve is
// that they scroll away — a client offline when one lands never sees it,
// and nobody has a record of who put their hand up.
//
// One board for everyone: the same deals, the same order. What differs by
// role is the action. A client says they're interested; an Admin sees who
// did, and runs the sync.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Briefcase, Check, ExternalLink, Loader2, MessageSquare, RefreshCw, Search, Users, X,
} from "lucide-react";
import { C, NICHES } from "@/lib/theme";
import { Card, Badge, Button, EmptyState, Modal, SectionHeader, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import { useDefaultScopedClientId } from "@/components/useDefaultClient";
import {
  fetchOpportunities, fetchClaims, claimOpportunity, withdrawClaim, setClaimStatus,
  setOpportunityStatus, removeOpportunity,
  type BrandOpportunity, type OpportunityClaim, type ClaimStatus,
} from "@/lib/queries/opportunities";
import { useToast, toastMessage } from "@/components/Toast";

const ALL = "__all__";

function money(n: number | null): string {
  if (!n) return "";
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(n)}`;
}

// Brands rarely have a usable logo, so the fallback is a monogram rather
// than a broken image or a generic placeholder that reads as "missing".
function BrandMark({ brand, logoUrl }: { brand: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const size = 44;

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: 10, objectFit: "cover", background: C.surface3, flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 10, background: C.accentDim, color: C.accentLight,
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 17, flexShrink: 0,
      }}
    >
      {(brand || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

export default function OpportunitiesPage() {
  const { profile, effectiveRole } = useSession();
  const { showToast } = useToast();
  const clientId = useDefaultScopedClientId();
  const isAdmin = effectiveRole === "Admin";

  const [deals, setDeals] = useState<BrandOpportunity[] | null>(null);
  const [claims, setClaims] = useState<OpportunityClaim[]>([]);
  const [search, setSearch] = useState("");
  const [niche, setNiche] = useState(ALL);
  const [showClosed, setShowClosed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<BrandOpportunity | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [d, c] = await Promise.all([fetchOpportunities(supabase), fetchClaims(supabase)]);
    setDeals(d);
    setClaims(c);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Claims come back already scoped by RLS: a client only ever sees their
  // own rows, so this map is "who's in" for an Admin and "am I in" for
  // everyone else, from the same query.
  const claimsByDeal = useMemo(() => {
    const m = new Map<string, OpportunityClaim[]>();
    claims.forEach((c) => {
      if (!m.has(c.opportunityId)) m.set(c.opportunityId, []);
      m.get(c.opportunityId)!.push(c);
    });
    return m;
  }, [claims]);

  const myClaim = useCallback(
    (dealId: string) => (clientId ? (claimsByDeal.get(dealId) || []).find((c) => c.clientId === clientId) : undefined),
    [claimsByDeal, clientId]
  );

  const niches = useMemo(() => {
    const s = new Set<string>();
    (deals || []).forEach((d) => d.niche && s.add(d.niche));
    return [...s].sort();
  }, [deals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (deals || []).filter((d) => {
      if (!showClosed && d.status !== "open") return false;
      if (niche !== ALL && d.niche !== niche) return false;
      if (!q) return true;
      return [d.brand, d.title, d.description, d.requirements, d.paySummary, d.niche]
        .some((f) => (f || "").toLowerCase().includes(q));
    });
  }, [deals, search, niche, showClosed]);

  async function runSync() {
    setError("");
    setSyncing(true);
    try {
      const res = await fetch("/api/opportunities/sync", { method: "POST" });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("That took too long — try again in a moment.");
      }
      if (!res.ok) throw new Error(json.error || "Couldn't sync from Discord");
      showToast(
        json.imported > 0
          ? `Pulled in ${json.imported} deal${json.imported === 1 ? "" : "s"} from Discord.`
          : `No new deals — scanned ${json.scanned} recent message${json.scanned === 1 ? "" : "s"}.`,
        "success"
      );
      reload();
    } catch (err) {
      setError(toastMessage(err, "Couldn't sync from Discord — try again."));
    } finally {
      setSyncing(false);
    }
  }

  async function toggleInterest(deal: BrandOpportunity) {
    if (!clientId) return;
    setError("");
    setClaimingId(deal.id);
    const existing = myClaim(deal.id);
    try {
      const supabase = createClient();
      if (existing) await withdrawClaim(supabase, existing.id);
      else await claimOpportunity(supabase, deal.id, clientId, profile.id, null);
      await reload();
    } catch (err) {
      setError(toastMessage(err, "Couldn't update that — try again."));
    } finally {
      setClaimingId(null);
    }
  }

  async function updateClaim(claimId: string, status: ClaimStatus) {
    try {
      await setClaimStatus(createClient(), claimId, status);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't update that applicant."));
    }
  }

  async function closeDeal(deal: BrandOpportunity, status: "open" | "closed" | "filled") {
    try {
      await setOpportunityStatus(createClient(), deal.id, status);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't update that deal."));
    }
  }

  async function deleteDeal(deal: BrandOpportunity) {
    try {
      await removeOpportunity(createClient(), deal.id);
      setViewing(null);
      reload();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't remove that deal."));
    }
  }

  if (!deals) return <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div>;

  const selectStyle = { ...inputStyle, width: "auto", minWidth: 150, padding: "7px 10px", fontSize: 12.5 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionHeader
        eyebrow="GET PAID"
        title="Brand Deals"
        action={
          isAdmin ? (
            <Button size="sm" variant="secondary" onClick={runSync} disabled={syncing}>
              {syncing ? <Loader2 size={13} className="cl-spin" /> : <RefreshCw size={13} />}
              {syncing ? "Reading Discord..." : "Sync from Discord"}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 12, lineHeight: 1.6 }}>
          {isAdmin
            ? "Deals pulled out of your campaign-managers and community-deals channels. Sync reads the recent posts, keeps the real offers, and skips the chatter — running it again won't duplicate anything."
            : "Brand deals open to you right now. Tap I'm interested and Akira will see you're in — no need to catch the Discord post in time."}
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            style={{ ...inputStyle, paddingLeft: 34 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, pay, or requirements..."
          />
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.textFaint }}>
            <Search size={14} />
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={selectStyle} value={niche} onChange={(e) => setNiche(e.target.value)}>
            <option value={ALL}>All niches</option>
            {niches.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <Button size="sm" variant={showClosed ? "primary" : "secondary"} onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Showing closed" : "Open only"}
          </Button>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.textFaint }}>
            {filtered.length} of {deals.length}
          </span>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.danger, marginTop: 12, lineHeight: 1.5 }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          text={
            deals.length === 0
              ? isAdmin
                ? "No deals yet — hit Sync from Discord to pull in what's already been posted."
                : "No brand deals open right now. New ones land here as soon as they're announced."
              : "No deals match those filters."
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((d) => {
            const mine = myClaim(d.id);
            const interested = claimsByDeal.get(d.id) || [];
            return (
              <Card key={d.id} style={{ padding: 14, display: "flex", gap: 13, alignItems: "flex-start" }}>
                <BrandMark brand={d.brand} logoUrl={d.logoUrl} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{d.brand}</span>
                    {d.niche && <Badge tone="accent">{d.niche}</Badge>}
                    {d.status !== "open" && <Badge>{d.status === "filled" ? "Filled" : "Closed"}</Badge>}
                    {/* The number that decides whether it's worth their time. */}
                    {d.maxMonthlyUsd ? (
                      <Badge tone="success">up to {money(d.maxMonthlyUsd)}/mo</Badge>
                    ) : d.basePayUsd ? (
                      <Badge tone="success">{money(d.basePayUsd)}/video</Badge>
                    ) : null}
                  </div>

                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{d.title}</div>

                  {d.paySummary && (
                    <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.55, marginBottom: 8 }}>{d.paySummary}</div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Button size="sm" variant="secondary" onClick={() => setViewing(d)}>
                      Details
                    </Button>

                    {!isAdmin && d.status === "open" && (
                      <Button size="sm" onClick={() => toggleInterest(d)} disabled={claimingId === d.id || !clientId}>
                        {claimingId === d.id ? <Loader2 size={12} className="cl-spin" /> : mine ? <Check size={12} /> : null}
                        {mine ? "You're in" : "I'm interested"}
                      </Button>
                    )}

                    {isAdmin && (
                      <span style={{ fontSize: 11.5, color: interested.length ? C.accentLight : C.textFaint, display: "flex", alignItems: "center", gap: 5 }}>
                        <Users size={12} />
                        {interested.length === 0
                          ? "Nobody yet"
                          : `${interested.length} interested — ${interested.map((c) => c.clientName).join(", ")}`}
                      </span>
                    )}

                    {d.discordMessageUrl && (
                      <a href={d.discordMessageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: C.textFaint, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                        <MessageSquare size={11} /> Original post
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewing && (
        <DealModal
          deal={viewing}
          isAdmin={isAdmin}
          claims={claimsByDeal.get(viewing.id) || []}
          onClose={() => setViewing(null)}
          onSetStatus={(s) => closeDeal(viewing, s)}
          onDelete={() => deleteDeal(viewing)}
          onUpdateClaim={updateClaim}
        />
      )}
    </div>
  );
}

function DealModal({
  deal, isAdmin, claims, onClose, onSetStatus, onDelete, onUpdateClaim,
}: {
  deal: BrandOpportunity;
  isAdmin: boolean;
  claims: OpportunityClaim[];
  onClose: () => void;
  onSetStatus: (s: "open" | "closed" | "filled") => void;
  onDelete: () => void;
  onUpdateClaim: (claimId: string, status: ClaimStatus) => void;
}) {
  const row = (label: string, value: string | null) =>
    value ? (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{value}</div>
      </div>
    ) : null;

  return (
    <Modal onClose={onClose} title={deal.brand}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <BrandMark brand={deal.brand} logoUrl={deal.logoUrl} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{deal.title}</div>
          {deal.niche && <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{deal.niche}</div>}
        </div>
      </div>

      {row("What it is", deal.description)}
      {row("Pay", deal.paySummary)}
      {deal.maxMonthlyUsd ? (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: C.success }}>
          Around {money(deal.maxMonthlyUsd)}/month at {deal.postingVolume || "the stated volume"}
          {deal.maxPostsPerMonth ? ` (~${deal.maxPostsPerMonth} posts)` : ""}. Excludes view bonuses and prizes.
        </div>
      ) : null}
      {row("Posting volume", deal.postingVolume)}
      {row("Deliverables", deal.deliverables)}
      {row("Requirements", deal.requirements)}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        {deal.applyUrl && (
          <a href={deal.applyUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Button size="sm"><ExternalLink size={12} /> Apply</Button>
          </a>
        )}
        {deal.discordMessageUrl && (
          <a href={deal.discordMessageUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <Button size="sm" variant="secondary"><MessageSquare size={12} /> Original post</Button>
          </a>
        )}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Who's interested ({claims.length})</div>
          {claims.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textFaint }}>Nobody has put their hand up yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
              {claims.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface2, borderRadius: 8, padding: "8px 10px" }}>
                  <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>{c.clientName}</span>
                  <Badge tone={c.status === "accepted" ? "success" : c.status === "declined" ? "default" : "accent"}>{c.status}</Badge>
                  {c.status !== "accepted" && (
                    <button onClick={() => onUpdateClaim(c.id, "accepted")} title="Accept" style={{ background: "none", border: "none", color: C.success, cursor: "pointer" }}>
                      <Check size={14} />
                    </button>
                  )}
                  {c.status !== "declined" && (
                    <button onClick={() => onUpdateClaim(c.id, "declined")} title="Decline" style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {deal.status !== "open" && <Button size="sm" variant="secondary" onClick={() => onSetStatus("open")}>Reopen</Button>}
            {deal.status === "open" && <Button size="sm" variant="secondary" onClick={() => onSetStatus("filled")}>Mark filled</Button>}
            {deal.status === "open" && <Button size="sm" variant="secondary" onClick={() => onSetStatus("closed")}>Close</Button>}
            <Button size="sm" variant="danger" onClick={onDelete}>Remove</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
