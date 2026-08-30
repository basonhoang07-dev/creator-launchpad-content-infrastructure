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
  AlertCircle, Briefcase, ExternalLink, Loader2, MessageSquare, Plus, RefreshCw, Search, Trash2,
} from "lucide-react";
import { C, NICHES } from "@/lib/theme";
import { Card, Badge, Button, EmptyState, Field, Modal, SectionHeader, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { useSession } from "@/components/SessionProvider";
import {
  fetchOpportunities, setOpportunityStatus, removeOpportunity, createOpportunity,
  type BrandOpportunity, type NewOpportunityInput,
} from "@/lib/queries/opportunities";
import { useToast, toastMessage } from "@/components/Toast";

const ALL = "__all__";

function money(n: number | null): string {
  if (!n) return "";
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(n)}`;
}

// The headline number, and the unit it's in. A deal quoted per-video has no
// honest monthly figure without a cadence, so it says so rather than
// inventing one — the two aren't interchangeable and a creator comparing
// cards needs to know which they're looking at.
function headlineRate(d: BrandOpportunity): { amount: string; unit: string } | null {
  if (d.maxMonthlyUsd) return { amount: money(d.maxMonthlyUsd), unit: "/month" };
  if (d.basePayUsd) return { amount: money(d.basePayUsd), unit: "/video" };
  return null;
}

function views(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function postedAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

// Brands rarely have a usable logo, so the fallback is a monogram rather
// than a broken image or a generic placeholder that reads as "missing".
// A deterministic hue off the name means the same brand keeps the same
// colour everywhere it appears, which is what makes a wall of them
// scannable.
function brandHue(brand: string): number {
  let h = 0;
  for (let i = 0; i < brand.length; i++) h = (h * 31 + brand.charCodeAt(i)) % 360;
  return h;
}

function BrandMark({ brand, logoUrl, size = 44 }: { brand: string; logoUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: size / 4, objectFit: "cover", background: C.surface3, flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size / 4,
        background: `hsl(${brandHue(brand)}, 45%, 22%)`, color: `hsl(${brandHue(brand)}, 70%, 78%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
      }}
    >
      {(brand || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

// The card's header image. Posts that attach a creative give a real banner;
// everything else gets the brand's own colour with its mark centred, which
// still reads as that brand rather than as a missing image.
function BrandBanner({ brand, logoUrl }: { brand: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const hue = brandHue(brand);
  // A favicon is 128px of icon — stretching it across a banner looks broken,
  // so only a genuine attachment is used as artwork.
  const isArtwork = !!logoUrl && !logoUrl.includes("google.com/s2/favicons");

  if (isArtwork && !failed) {
    return (
      <img
        src={logoUrl!}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    );
  }
  return (
    <div
      style={{
        width: "100%", height: "100%",
        background: `linear-gradient(135deg, hsl(${hue}, 42%, 20%), hsl(${(hue + 40) % 360}, 38%, 13%))`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <BrandMark brand={brand} logoUrl={logoUrl} size={52} />
    </div>
  );
}


// The whole point of the board for a client: which human to message. These
// deals belong to the campaign managers who posted them, so applying means
// DMing that person on Discord — a link, not a button that only tells us.
function DmContact({ deal, large = false }: { deal: BrandOpportunity; large?: boolean }) {
  if (!deal.contactDiscordUsername) return null;

  const label = `DM @${deal.contactDiscordUsername}`;
  // Without an id there is nothing to link to — Discord dropped
  // discriminators, so a bare username no longer resolves to a person. Show
  // it as text so the client can still search for them.
  if (!deal.contactDiscordId) {
    return (
      <span style={{ fontSize: large ? 13 : 11.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 5 }}>
        <MessageSquare size={large ? 14 : 12} /> {label} on Discord
      </span>
    );
  }
  return (
    <a href={`https://discord.com/users/${deal.contactDiscordId}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
      <Button size={large ? "md" : "sm"} style={large ? { padding: "11px 22px", fontSize: 14, borderRadius: 999 } : undefined}>
        <MessageSquare size={large ? 15 : 12} /> {label}
      </Button>
    </a>
  );
}

export default function OpportunitiesPage() {
  const { profile, effectiveRole } = useSession();
  const { showToast } = useToast();
  const isAdmin = effectiveRole === "Admin";

  const [deals, setDeals] = useState<BrandOpportunity[] | null>(null);
  const [search, setSearch] = useState("");
  const [niche, setNiche] = useState(ALL);
  const [showClosed, setShowClosed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewing, setViewing] = useState<BrandOpportunity | null>(null);
  const [adding, setAdding] = useState(false);
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

  async function addDeal(input: NewOpportunityInput) {
    await createOpportunity(createClient(), profile.organization_id, profile.id, input);
    setAdding(false);
    reload();
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button size="sm" onClick={() => setAdding(true)}><Plus size={13} /> Add a deal</Button>
              <Button size="sm" variant="secondary" onClick={runSync} disabled={syncing}>
                {syncing ? <Loader2 size={13} className="cl-spin" /> : <RefreshCw size={13} />}
                {syncing ? "Reading Discord..." : "Sync from Discord"}
              </Button>
            </div>
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
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" }}>
          {filtered.map((d) => {
            const rate = headlineRate(d);
            return (
              <Card key={d.id} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {/* Banner. The money sits on top of it, because it's the one
                    thing a creator scans for before reading anything else. */}
                <div style={{ position: "relative", height: 132, background: C.surface3 }}>
                  <BrandBanner brand={d.brand} logoUrl={d.logoUrl} />
                  {rate && (
                    <div
                      style={{
                        position: "absolute", top: 10, right: 10,
                        background: "#fff", color: "#111", borderRadius: 999,
                        padding: "6px 13px", fontSize: 13, fontWeight: 700,
                        boxShadow: "0 2px 10px rgba(0,0,0,0.35)", whiteSpace: "nowrap",
                      }}
                    >
                      {rate.amount}
                      <span style={{ fontWeight: 500, opacity: 0.65 }}>{rate.unit}</span>
                    </div>
                  )}
                  {d.status !== "open" && (
                    <div style={{ position: "absolute", top: 10, left: 10 }}>
                      <Badge>{d.status === "filled" ? "Filled" : "Closed"}</Badge>
                    </div>
                  )}
                </div>

                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: C.text,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}
                  >
                    {d.title}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {d.niche && <Badge tone="accent">{d.niche}</Badge>}
                    {d.postingVolume && <Badge>{d.postingVolume}</Badge>}
                    {d.bonusTiers && d.bonusTiers.length > 0 && (
                      <Badge tone="success">{d.bonusTiers.length} bonus tiers</Badge>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                    <BrandMark brand={d.brand} logoUrl={d.logoUrl} size={22} />
                    <span style={{ fontSize: 12, color: C.textMuted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.brand}
                    </span>
                    <span style={{ fontSize: 11, color: C.textFaint }}>{postedAgo(d.postedAt)}</span>
                  </div>

                  {/* The action stays on the card, not just behind Details —
                      knowing who to message is the whole reason a client
                      opens this page. */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Button size="sm" variant="secondary" onClick={() => setViewing(d)}>
                      Details
                    </Button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <DmContact deal={d} />
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteDeal(d)}
                        title="Remove this deal"
                        style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", padding: 4 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {adding && (
        <AddDealModal
          onClose={() => setAdding(false)}
          onCreate={addDeal}
        />
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


// The pay block, laid out the way a creator reads it: what one post is worth,
// how often they can post, then what that adds up to — and finally the
// ladder, which is the part that decides whether a deal is worth chasing.
function PayPanel({ deal }: { deal: BrandOpportunity }) {
  const [showAll, setShowAll] = useState(false);
  const ladder = deal.bonusTiers || [];
  // Four is enough to show the shape of the curve without turning the panel
  // into a table.
  const shown = showAll ? ladder : ladder.slice(0, 4);
  const hidden = ladder.length - shown.length;

  if (!deal.basePayUsd && !deal.maxMonthlyUsd && ladder.length === 0) return null;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
      {(deal.basePayUsd || deal.postingVolume) && (
        <div style={{ display: "flex", gap: 16, marginBottom: deal.maxMonthlyUsd ? 16 : 0 }}>
          {deal.basePayUsd ? (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>PER POST</div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{money(deal.basePayUsd)}</div>
            </div>
          ) : null}
          {deal.postingVolume ? (
            <div style={{ flex: 1, borderLeft: deal.basePayUsd ? `1px solid ${C.border}` : undefined, paddingLeft: deal.basePayUsd ? 16 : 0 }}>
              <div style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>FREQUENCY</div>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{deal.postingVolume}</div>
            </div>
          ) : null}
        </div>
      )}

      {deal.maxMonthlyUsd ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 600, letterSpacing: "0.05em" }}>MONTHLY POTENTIAL</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.accentLight, letterSpacing: "-0.02em" }}>{money(deal.maxMonthlyUsd)}</div>
        </div>
      ) : null}

      {ladder.length > 0 && (
        <div style={{ background: C.surface2, borderRadius: 10, padding: 13, marginTop: 14 }}>
          <div style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 9 }}>BONUS LADDER</div>
          <div style={{ display: "grid", gap: 7 }}>
            {shown.map((t) => (
              <div key={t.views} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 12.5, color: C.textMuted }}>{views(t.views)} views</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.success }}>{money(t.amountUsd)}</span>
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              style={{ background: "none", border: "none", padding: 0, marginTop: 9, color: C.textFaint, fontSize: 11.5, cursor: "pointer" }}
            >
              +{hidden} more tier{hidden === 1 ? "" : "s"}
            </button>
          )}
          {/* Said once, here, because "$130 at 50K" reads as a bonus on top of
              base pay unless you know these posts quote the total. */}
          <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 10, lineHeight: 1.5 }}>
            Amounts as quoted in the post — usually the total paid for a video that hits that count, not added to base pay.
          </div>
        </div>
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
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, marginBottom: 5, letterSpacing: "0.03em" }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{value}</div>
      </div>
    ) : null;

  return (
    <Modal onClose={onClose} title={deal.brand} width={580}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <BrandMark brand={deal.brand} logoUrl={deal.logoUrl} size={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{deal.brand}</div>
          <div style={{ fontSize: 11.5, color: C.textFaint }}>{postedAgo(deal.postedAt)}</div>
        </div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 8 }}>{deal.title}</div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        {deal.niche && <Badge tone="accent">{deal.niche}</Badge>}
        {deal.postingVolume && <Badge>{deal.postingVolume}</Badge>}
        {deal.status !== "open" && <Badge>{deal.status === "filled" ? "Filled" : "Closed"}</Badge>}
      </div>

      <PayPanel deal={deal} />

      {row("What you'd be doing", deal.description)}
      {row("Pay", deal.paySummary)}
      {row("Deliverables", deal.deliverables)}
      {row("Requirements", deal.requirements)}

      {deal.maxMonthlyUsd ? (
        <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.6, marginBottom: 16 }}>
          The monthly figure is base pay at {deal.postingVolume || "the stated volume"}
          {deal.maxPostsPerMonth ? ` (~${deal.maxPostsPerMonth} posts)` : ""} — view bonuses and one-off prizes aren't
          counted, since they don't repeat.
        </div>
      ) : null}

      {/* The money and the way to act on it, together — a creator decides on
          the number and then needs somewhere to go. */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4,
        }}
      >
        <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.5 }}>
          Deals are arranged directly with whoever posted them.
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {deal.applyUrl && (
            <a href={deal.applyUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="secondary"><ExternalLink size={12} /> Apply link</Button>
            </a>
          )}
          <DmContact deal={deal} large />
        </div>
      </div>

      {deal.discordMessageUrl && (
        <div style={{ marginTop: 12 }}>
          <a
            href={deal.discordMessageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: C.textFaint, display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}
          >
            <MessageSquare size={11} /> See the original post
          </a>
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
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

// Hand-added deals: a brand that came to Akira directly, or one the sync
// read badly enough to be worth redoing. Only brand is required — a deal
// half-described is still more useful on the board than one that never got
// added because the form asked for too much.
function AddDealModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: NewOpportunityInput) => Promise<void>;
}) {
  const empty: NewOpportunityInput = {
    brand: "", title: "", description: "", niche: "", paySummary: "", basePayUsd: "",
    postingVolume: "", maxPostsPerMonth: "", requirements: "", applyUrl: "",
    contactDiscordUsername: "", contactDiscordId: "",
  };
  const [form, setForm] = useState<NewOpportunityInput>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof NewOpportunityInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    if (!form.brand.trim()) return;
    setError("");
    setSaving(true);
    try {
      await onCreate(form);
    } catch (err) {
      setError(toastMessage(err, "Couldn't save that deal — try again."));
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Add a brand deal" width={560}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Brand">
            <input style={inputStyle} value={form.brand} onChange={set("brand")} placeholder="Makon AI" autoFocus />
          </Field>
          <Field label="Niche">
            <select style={inputStyle} value={form.niche} onChange={set("niche")}>
              <option value="">Not set</option>
              {NICHES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Headline">
          <input style={inputStyle} value={form.title} onChange={set("title")} placeholder="SAT prep app — talking-head UGC" />
        </Field>

        <Field label="What it is">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.description} onChange={set("description")} />
        </Field>

        <Field label="Pay terms">
          <textarea
            style={{ ...inputStyle, minHeight: 52, resize: "vertical" }}
            value={form.paySummary}
            onChange={set("paySummary")}
            placeholder="$30 base per video, view bonuses up to $730 at 1M"
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label="Base $ / video">
            <input style={inputStyle} value={form.basePayUsd} onChange={set("basePayUsd")} placeholder="30" />
          </Field>
          <Field label="Posts / month">
            <input style={inputStyle} value={form.maxPostsPerMonth} onChange={set("maxPostsPerMonth")} placeholder="60" />
          </Field>
          <Field label="Cadence">
            <input style={inputStyle} value={form.postingVolume} onChange={set("postingVolume")} placeholder="1-2x/day" />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: -6, lineHeight: 1.5 }}>
          Base and posts/month are multiplied into the "up to $X/mo" badge. Leave them blank if the deal isn't paid per video.
        </div>

        <Field label="Requirements">
          <textarea style={{ ...inputStyle, minHeight: 52, resize: "vertical" }} value={form.requirements} onChange={set("requirements")} placeholder="T1 audience, study-tips niche" />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="DM on Discord">
            <input style={inputStyle} value={form.contactDiscordUsername} onChange={set("contactDiscordUsername")} placeholder="kindmarko" />
          </Field>
          <Field label="Their Discord ID (for the link)">
            <input style={inputStyle} value={form.contactDiscordId} onChange={set("contactDiscordId")} placeholder="1355542830919188502" />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: -6, lineHeight: 1.5 }}>
          Without an ID the name shows as text — Discord dropped discriminators, so a username alone can't be linked to.
        </div>

        <Field label="Apply link">
          <input style={inputStyle} value={form.applyUrl} onChange={set("applyUrl")} placeholder="https://..." />
        </Field>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: C.danger, lineHeight: 1.5 }}>
            <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.brand.trim()}>
            {saving ? <Loader2 size={12} className="cl-spin" /> : <Plus size={12} />}
            {saving ? "Saving..." : "Add deal"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
