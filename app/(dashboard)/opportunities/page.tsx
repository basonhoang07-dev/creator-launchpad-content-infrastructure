"use client";

// app/(dashboard)/opportunities/page.tsx — Brand Deals
//
// Every open brand offer, pulled out of the Discord channels they're posted
// in. Discord is still where deals arrive; the problem it doesn't solve is
// that they scroll away — a client offline when one lands never sees it,
// and nobody has a record of who put their hand up.
//
// One board for everyone: the same deals, the same order. What a client
// does next happens back in Discord — the card names the person who posted
// the deal, because these offers belong to the campaign managers running
// them, not to us. Admin additionally runs the sync and can retire a deal.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Briefcase, ExternalLink, Loader2, MessageSquare, RefreshCw, Search,
} from "lucide-react";
import { C, NICHES } from "@/lib/theme";
import { Card, Badge, Button, EmptyState, Modal, SectionHeader, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import {
  fetchOpportunities, setOpportunityStatus, removeOpportunity, type BrandOpportunity,
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


// The whole point of the board for a client: which human to message. These
// deals belong to the campaign managers who posted them, so applying means
// DMing that person on Discord — a link, not a button that only tells us.
function DmContact({ deal }: { deal: BrandOpportunity }) {
  if (!deal.contactDiscordUsername) return null;

  const label = `DM @${deal.contactDiscordUsername}`;
  // Without an id there is nothing to link to — Discord dropped
  // discriminators, so a bare username no longer resolves to a person. Show
  // it as text so the client can still search for them.
  if (!deal.contactDiscordId) {
    return (
      <span style={{ fontSize: 11.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 5 }}>
        <MessageSquare size={12} /> {label} on Discord
      </span>
    );
  }
  return (
    <a
      href={`https://discord.com/users/${deal.contactDiscordId}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none" }}
    >
      <Button size="sm"><MessageSquare size={12} /> {label}</Button>
    </a>
  );
}

export default function OpportunitiesPage() {
  const { effectiveRole } = useSession();
  const { showToast } = useToast();
  const isAdmin = effectiveRole === "Admin";

  const [deals, setDeals] = useState<BrandOpportunity[] | null>(null);
  const [search, setSearch] = useState("");
  const [niche, setNiche] = useState(ALL);
  const [showClosed, setShowClosed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewing, setViewing] = useState<BrandOpportunity | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const supabase = createClient();
    setDeals(await fetchOpportunities(supabase));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
      // A run is capped, so a first sync over channel history leaves some
      // behind. Say so rather than letting it look like that's everything.
      const more = json.remaining > 0 ? ` ${json.remaining} older post${json.remaining === 1 ? "" : "s"} still to read — sync again.` : "";
      showToast(
        json.imported > 0
          ? `Pulled in ${json.imported} deal${json.imported === 1 ? "" : "s"} from Discord.${more}`
          : `No new deals — scanned ${json.scanned} recent message${json.scanned === 1 ? "" : "s"}.${more}`,
        "success"
      );
      reload();
    } catch (err) {
      setError(toastMessage(err, "Couldn't sync from Discord — try again."));
    } finally {
      setSyncing(false);
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
            : "Brand deals open to you right now. Each one names the person to DM on Discord to put yourself forward — no need to have caught the original post."}
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

                    <DmContact deal={d} />

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
          onClose={() => setViewing(null)}
          onSetStatus={(s) => closeDeal(viewing, s)}
          onDelete={() => deleteDeal(viewing)}
        />
      )}
    </div>
  );
}

function DealModal({
  deal, isAdmin, onClose, onSetStatus, onDelete,
}: {
  deal: BrandOpportunity;
  isAdmin: boolean;
  onClose: () => void;
  onSetStatus: (s: "open" | "closed" | "filled") => void;
  onDelete: () => void;
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
        <DmContact deal={deal} />
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
