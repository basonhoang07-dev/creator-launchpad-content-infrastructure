-- Lead capture from the public funnel, and the deeplinks that feed it.
--
-- Two problems this fixes. Leads currently exist only in Brevo, so there is
-- no way to see who came in, call them, or record what happened — and no
-- way to tell which post or bio link sent them, because every visitor hits
-- the same URL. And the guide they are promised never arrives, which means
-- the funnel's one job silently fails.
--
-- So leads land here, each stamped with the source that produced it, and
-- the funnel stops promising an email it can't deliver.

-- A named deeplink. One per post, bio link, story or collab — the slug is
-- what appears in the URL, and every lead that arrives through it carries
-- it, which is the whole point.
create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  slug text not null,
  label text not null,
  -- Where this source's leads are sent after they finish. Null falls back
  -- to the org default, so changing one campaign's destination never
  -- touches the others.
  destination_url text,
  archived_at timestamptz,
  created_at timestamptz default now(),
  unique (organization_id, slug)
);
alter table lead_sources enable row level security;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,

  first_name text not null,
  email text not null,
  phone text,
  instagram_handle text,

  -- The quiz answers, stored as the labels the funnel showed rather than
  -- its internal codes: these are read by a human before a call, and
  -- "Complete beginner" is worth more on a call sheet than "zero".
  ugc_goal text,
  experience_level text,
  biggest_blocker text,
  followers_band text,

  -- Attribution. Kept as free text rather than a foreign key so a lead
  -- survives its source being renamed or deleted — losing the row would
  -- lose the answer to "where did this person come from".
  source_slug text,
  landing_url text,

  -- The call sheet. Mirrors how these get worked in practice: a stage, a
  -- rough read on quality, whether they've been rung, and what to know
  -- before ringing them.
  stage text not null default 'New' check (stage in ('New', 'Dialed', 'Qualified', 'Booked', 'No Close', 'Junk')),
  quality text check (quality in ('Excellent', 'Mid', 'Low')),
  dialed boolean not null default false,
  dialed_at timestamptz,
  notes text,

  created_at timestamptz default now(),
  deleted_at timestamptz
);
alter table leads enable row level security;

create index if not exists leads_org_created_idx on leads (organization_id, created_at desc);
create index if not exists leads_source_idx on leads (source_slug);
-- One person, one row. A second submission updates rather than duplicating,
-- which matters because people redo the quiz to get the link again.
--
-- A plain constraint rather than a unique index on lower(email): the upsert
-- goes through PostgREST, whose on_conflict target has to name real columns.
-- Equivalent here because every address is lowercased before it is written.
alter table leads add constraint leads_org_email_key unique (organization_id, email);

-- Admin only, both tables. These are prospects, not client data — no client
-- has any business reading the list, and has_client_access would be the
-- wrong question to ask.
create policy "admin reads leads" on leads for select
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin updates leads" on leads for update
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin deletes leads" on leads for delete
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

create policy "admin reads sources" on lead_sources for select
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin writes sources" on lead_sources for insert
  with check (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin updates sources" on lead_sources for update
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
create policy "admin deletes sources" on lead_sources for delete
  using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

-- Where leads go when their source doesn't say otherwise.
alter table organizations add column if not exists lead_magnet_url text;
