-- Brand deals, pulled out of Discord and given a permanent home.
--
-- Deals are posted in #⛲┃campaign-managers and #⛲┃community-deals as
-- freeform messages, where they scroll away: a client who wasn't online
-- when one landed never sees it, and there's no record of who put their
-- hand up for what. Discord stays the place deals arrive; this is where
-- they live afterwards.
--
-- Org-wide rather than per-client on purpose. A deal is offered to the
-- whole roster and claimed by whoever fits, which is why interest lives in
-- a separate table rather than a client_id on the deal itself.

create table if not exists brand_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  brand text not null,
  title text not null,
  description text,
  -- Same taxonomy as retainer_campaigns.niche (migration 014), so a deal
  -- can be matched against the niche a client already works in.
  niche text,

  -- Pay is deliberately not normalised into one number. Real posts quote
  -- "$30 base + view bonuses to $730", "$10/1k views, unlimited posting",
  -- "30-post retainer from $25 base" — forcing that into a single rate
  -- loses the terms. pay_summary is what a client reads; base_pay_usd and
  -- max_monthly_usd exist only so the board can sort and answer "what's
  -- this actually worth if I go all in".
  pay_summary text,
  base_pay_usd numeric,
  posting_volume text,
  max_posts_per_month integer,
  max_monthly_usd numeric,

  deliverables text,
  requirements text,
  apply_url text,
  -- Resolved from any link in the post; null when the brand has no domain
  -- to derive one from, in which case the UI draws a monogram instead of
  -- showing a broken image.
  logo_url text,
  deadline date,
  status text not null default 'open' check (status in ('open', 'closed', 'filled')),
  posted_by_profile_id uuid references profiles(id),

  -- Provenance. discord_message_id is unique so re-running the sync
  -- updates a deal rather than duplicating it, which matters because these
  -- channels get edited and reposted.
  source_channel_id text,
  discord_message_id text unique,
  discord_message_url text,
  posted_at timestamptz,

  created_at timestamptz default now(),
  deleted_at timestamptz
);
alter table brand_opportunities enable row level security;

create index if not exists brand_opportunities_org_idx on brand_opportunities (organization_id, status);
create index if not exists brand_opportunities_niche_idx on brand_opportunities (niche);

-- One row per client per deal. Unique so a client can't double-claim, and
-- so "am I in on this" is a single lookup rather than a scan.
create table if not exists brand_opportunity_claims (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references brand_opportunities(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  -- Who actually clicked. A client's own account and their VA both reach
  -- this page, and it matters which one raised the hand.
  profile_id uuid references profiles(id),
  status text not null default 'interested' check (status in ('interested', 'applied', 'accepted', 'declined')),
  note text,
  created_at timestamptz default now(),
  unique (opportunity_id, client_id)
);
alter table brand_opportunity_claims enable row level security;

-- Everyone in the org reads the deals; only Admin writes them.
create policy "org members read opportunities" on brand_opportunities for select
  using (organization_id = private.my_organization_id());
create policy "admin posts opportunities" on brand_opportunities for insert
  with check (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin updates opportunities" on brand_opportunities for update
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin deletes opportunities" on brand_opportunities for delete
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

-- Claims follow the same rule as the rest of a client's data: a client sees
-- and creates only their own, Admin sees the whole board. Deliberately NOT
-- readable org-wide — who else applied for a deal isn't one client's
-- business.
create policy "read own claims" on brand_opportunity_claims for select
  using (private.has_client_access(client_id));
create policy "create own claims" on brand_opportunity_claims for insert
  with check (private.has_client_access(client_id));
create policy "update own claims" on brand_opportunity_claims for update
  using (private.has_client_access(client_id));
create policy "delete own claims" on brand_opportunity_claims for delete
  using (private.has_client_access(client_id));

-- Which Discord channels the sync reads. A list rather than one id because
-- deals arrive in more than one place, and org-level because a deal is
-- offered to everyone — unlike recaps and viral alerts, which are addressed
-- to a single client's channel.
alter table organizations add column if not exists brand_deal_channel_ids text[];
