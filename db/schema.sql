-- ============================================================================
-- Creator Launchpad — Production Database Schema (Supabase/Postgres)
-- ============================================================================
-- Designed multi-tenant from day one (an `organizations` layer above `clients`)
-- even though right now there's only one organization (Akira's business) with
-- one client (Adam). This costs almost nothing extra today and avoids a real
-- migration later if this becomes a sellable SaaS. "For now" just means the
-- signup/billing flow for NEW organizations doesn't get built yet — the data
-- shape underneath is already correct for when it does.
--
-- Auth: uses Supabase's built-in `auth.users` table. `profiles` extends it
-- with the app-specific fields (role, org membership, etc).
-- ============================================================================

-- ---------- Organizations (a coaching business — just Akira's, for now) ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- ---------- Clients (a creator the org coaches — e.g. Adam) ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  name text not null,
  google_meet_email text,
  discord_webhook_url text,
  discord_channel_id text,
  ugc_kpi_goal numeric default 0,
  ugc_kpi_rate_per_deal numeric default 0,
  ugc_kpi_closing_rate numeric default 0,
  ugc_kpi_response_rate numeric default 0,
  created_at timestamptz default now()
);

-- ---------- Profiles (extends Supabase auth.users with app roles) ----------
create table profiles (
  id uuid primary key references auth.users(id),
  organization_id uuid references organizations(id) not null,
  -- for a Client-role account, which client record they *are*.
  -- for Admin/VA-Editor/Creative Director, this is null.
  client_id uuid references clients(id),
  name text not null,
  email text not null,
  role text not null check (role in ('Admin','Client','VA/Editor','Creative Director')),
  status text not null default 'approved' check (status in ('pending','approved')),
  google_meet_email text,
  created_at timestamptz default now()
);

-- Which clients a VA/Editor or Creative Director has been granted access to
-- (replaces the prototype's accessibleClients array with a real join table).
create table account_client_access (
  profile_id uuid references profiles(id) not null,
  client_id uuid references clients(id) not null,
  primary key (profile_id, client_id)
);

-- ---------- Retainer campaigns (one brand deal per client) ----------
create table retainer_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  brand text not null,
  rate numeric default 0,
  min_posts int default 0,
  max_posts int default 0,
  session_capacity int default 0,
  created_at timestamptz default now()
);

create table bonus_tiers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references retainer_campaigns(id) on delete cascade not null,
  views int not null,
  bonus numeric not null
);

-- ---------- Content Calendar ----------
create table calendar_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  brand text not null,
  title text not null,
  format text,
  script text default '',
  entry_date date, -- null = unscheduled
  batch text,
  status text default 'Unscripted',
  editor_profile_id uuid references profiles(id),
  reference_link text,
  raw_video_link text,
  final_video_link text,
  notes text,
  posted boolean default false,
  view_count int default 0,
  bonus_logged boolean default false,
  created_at timestamptz default now()
);

create table calendar_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references calendar_entries(id) on delete cascade not null,
  author_name text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz default now()
);

create table calendar_trash (
  -- mirrors calendar_entries shape; deleted entries move here, restorable
  id uuid primary key default gen_random_uuid(),
  original_entry jsonb not null,
  deleted_at timestamptz default now()
);

-- ---------- Availability blocks ----------
create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  label text not null,
  block_date date not null,
  all_day boolean default true,
  start_time time,
  end_time time,
  repeat_freq text default 'none'
);

-- ---------- Recurring concept templates ----------
create table templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  brand text not null,
  title_base text not null,
  format text,
  freq text not null,
  next_due date not null
);

-- ---------- Brand profiles (for the "Adapt a script" feature) ----------
create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  brand text not null,
  demo_script_1 text,
  demo_script_2 text,
  demo_script_3 text,
  product_note text,
  unique (client_id, brand)
);

-- ---------- SOP Libraries (shared across an organization, not per-client) ----------
create table sops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  kind text not null check (kind in ('ugc','format')),
  title text not null,
  body text not null,
  author_name text,
  author_role text,
  thumbnail_url text,
  reference_video_link text,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table sop_images (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade not null,
  image_url text not null
);

-- ---------- Weekly check-ins ----------
create table weekly_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  week_of date not null,
  ugc_one_off numeric default 0,
  energy_level int,
  went_well text,
  could_improve text,
  deep_work_hours numeric default 0,
  outreach_sent int default 0,
  outreach_follow_ups int default 0,
  deals_closed int default 0,
  roadblock text,
  roadblock_action text,
  gratitude text,
  next_week_tasks text,
  created_at timestamptz default now(),
  unique (client_id, week_of)
);

create table weekly_log_campaign_entries (
  id uuid primary key default gen_random_uuid(),
  weekly_log_id uuid references weekly_logs(id) on delete cascade not null,
  campaign_brand text not null,
  videos_filmed int default 0,
  amount_earned numeric default 0,
  bonus_earned numeric default 0
);

-- ---------- Call Recaps ----------
create table recaps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  title text not null,
  recap_date date not null,
  attendee_email text,
  tldr text,
  recording_url text,
  transcript text,
  source text default 'manual' check (source in ('manual','auto')),
  created_at timestamptz default now()
);

create table recap_action_items (
  id uuid primary key default gen_random_uuid(),
  recap_id uuid references recaps(id) on delete cascade not null,
  body text not null,
  done boolean default false
);

create table recap_decisions (
  id uuid primary key default gen_random_uuid(),
  recap_id uuid references recaps(id) on delete cascade not null,
  body text not null
);

-- ---------- Integrations (per client) ----------
create table integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  integration_key text not null, -- 'drive' | 'gcal' | 'bento' | 'sandcastles' | 'warmr' | 'fathom'
  connected boolean default false,
  unique (client_id, integration_key)
);

-- ---------- AI usage tracking ----------
-- One row per successful Claude API call. lib/auth.ts sums rows for the
-- current calendar month per client_id before letting a claude/* route run,
-- so one client can't burn through the whole org's Anthropic spend limit.
-- Deliberately just a call counter, not per-token/per-cost — see the routes'
-- comments for why that's enough for now.
create table ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  route text not null,
  created_at timestamptz default now()
);
create index ai_usage_log_client_month_idx on ai_usage_log (client_id, created_at);

-- ---------- Access requests ----------
-- The public "Request access" form on the login page inserts here — NOT into
-- auth.users/profiles directly. No real login exists until an Admin approves
-- the request (app/api/admin/approve-request), which is the only place a new
-- account actually gets created. Denying just deletes the row; nothing to
-- clean up, since nothing was ever provisioned.
create table access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now()
);

-- ---------- Announcements ----------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  body text not null,
  created_at timestamptz default now()
);

-- ============================================================================
-- Row Level Security — this is the part that actually enforces who can see
-- what, server-side, which the prototype could never do (it ran entirely
-- client-side, no server enforcement at all). Mirrors the exact role rule
-- lib/auth.ts enforces for the Claude API routes: Admin sees everything in
-- their org; Client sees only their own client_id; VA/Editor and Creative
-- Director see only clients explicitly granted via account_client_access.
--
-- These three helper functions are `security definer` so they can read
-- `profiles` without recursing into profiles' own RLS policy — every policy
-- below calls one of these instead of repeating the same subquery per table.
--
-- They live in `private`, a schema PostgREST never exposes (only `public` is
-- in the exposed schema list), so they're callable from inside RLS policies
-- but NOT reachable as a public API endpoint (e.g. POST /rest/v1/rpc/my_role)
-- the way they would be sitting in `public`. `set search_path = ''` plus
-- fully-qualifying every table reference (`public.profiles`, not `profiles`)
-- closes the other half of the same class of bug — a SECURITY DEFINER
-- function with a mutable search_path can be tricked into resolving an
-- attacker-controlled object of the same name from a schema earlier in the
-- caller's search_path. Both fixes came from Supabase's own security advisor.
--
-- Test these carefully against the running app before pointing real client
-- data at it; RLS bugs fail either as "nobody can see anything" (loud, easy
-- to catch) or "someone sees data they shouldn't" (silent, the one to test
-- deliberately — sign in as each of the four roles and confirm boundaries).
-- ============================================================================

create schema if not exists private;

create or replace function private.my_organization_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function private.has_client_access(target_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when (select role from public.profiles where id = auth.uid()) = 'Admin' then
      exists (select 1 from public.clients where id = target_client_id and organization_id = private.my_organization_id())
    when (select role from public.profiles where id = auth.uid()) = 'Client' then
      (select client_id from public.profiles where id = auth.uid()) = target_client_id
    when auth.uid() is not null then
      exists (select 1 from public.account_client_access where profile_id = auth.uid() and client_id = target_client_id)
    else false
  end;
$$;

alter table organizations enable row level security;
alter table clients enable row level security;
alter table profiles enable row level security;
alter table account_client_access enable row level security;
alter table retainer_campaigns enable row level security;
alter table bonus_tiers enable row level security;
alter table calendar_entries enable row level security;
alter table calendar_comments enable row level security;
alter table calendar_trash enable row level security;
alter table availability_blocks enable row level security;
alter table templates enable row level security;
alter table brand_profiles enable row level security;
alter table sops enable row level security;
alter table sop_images enable row level security;
alter table weekly_logs enable row level security;
alter table weekly_log_campaign_entries enable row level security;
alter table recaps enable row level security;
alter table recap_action_items enable row level security;
alter table recap_decisions enable row level security;
alter table integrations enable row level security;
alter table announcements enable row level security;
alter table ai_usage_log enable row level security;
alter table access_requests enable row level security;

-- organizations: readable by anyone, signed in or not. No sensitive fields
-- live here (name + owner_user_id) — the public "Request access" form needs
-- to resolve the org id while still anonymous now that submitting a request
-- no longer creates a real login (see access_requests below), so this can't
-- be gated to authenticated-only anymore. Fine for single-org today; the
-- future multi-tenant signup flow will need its own lookup path anyway.
create policy "anyone can read organizations" on organizations for select using (true);

-- clients: org members can read every client in their org (the roster);
-- writes go through has_client_access so a Client can't edit another client's row.
create policy "org members read clients" on clients for select using (organization_id = private.my_organization_id());
create policy "admins manage clients" on clients for all using (organization_id = private.my_organization_id() and private.my_role() = 'Admin') with check (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

-- profiles: everyone in an org can see each other (rosters, editor dropdowns);
-- a user can always update their own row; only Admin can update/remove others.
-- Note there is deliberately no public "insert your own profile" policy —
-- profile rows only ever get created server-side (service-role key) by the
-- approve-request/invite routes, never directly by an anonymous signup.
create policy "org members read profiles" on profiles for select using (id = auth.uid() or organization_id = private.my_organization_id());
create policy "self or admin update profiles" on profiles for update using (id = auth.uid() or (organization_id = private.my_organization_id() and private.my_role() = 'Admin'));
create policy "admin deletes profiles" on profiles for delete using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

-- account_client_access: a VA/Editor or Creative Director can read their own
-- grants (needed for the sidebar's client picker); only Admin manages grants.
create policy "read own or admin-managed grants" on account_client_access for select using (
  profile_id = auth.uid() or exists (select 1 from profiles p where p.id = profile_id and p.organization_id = private.my_organization_id())
);
create policy "admin manages grants" on account_client_access for insert with check (
  private.my_role() = 'Admin' and exists (select 1 from profiles p where p.id = profile_id and p.organization_id = private.my_organization_id())
);
create policy "admin revokes grants" on account_client_access for delete using (
  private.my_role() = 'Admin' and exists (select 1 from profiles p where p.id = profile_id and p.organization_id = private.my_organization_id())
);

-- access_requests: anyone (signed in or not) can submit a request — that's
-- the whole point, it's the only thing an unapproved visitor can create.
-- Only Admin can read/manage the queue. No update/delete-by-requester at all;
-- once submitted, only an Admin's approve/deny action (server-side, service
-- role) touches the row again.
create policy "anyone can submit an access request" on access_requests for insert with check (
  exists (select 1 from organizations where id = organization_id)
);
create policy "admin reads access requests" on access_requests for select using (
  organization_id = private.my_organization_id() and private.my_role() = 'Admin'
);
create policy "admin denies access requests" on access_requests for update using (
  organization_id = private.my_organization_id() and private.my_role() = 'Admin'
);
create policy "admin deletes access requests" on access_requests for delete using (
  organization_id = private.my_organization_id() and private.my_role() = 'Admin'
);

create policy "client-scoped access" on retainer_campaigns for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on bonus_tiers for all using (private.has_client_access((select client_id from retainer_campaigns where id = campaign_id))) with check (private.has_client_access((select client_id from retainer_campaigns where id = campaign_id)));
create policy "client-scoped access" on calendar_entries for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on calendar_comments for all using (private.has_client_access((select client_id from calendar_entries where id = entry_id))) with check (private.has_client_access((select client_id from calendar_entries where id = entry_id)));
create policy "client-scoped access" on calendar_trash for all using (private.has_client_access(((original_entry->>'client_id'))::uuid)) with check (private.has_client_access(((original_entry->>'client_id'))::uuid));
create policy "client-scoped access" on availability_blocks for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on templates for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on brand_profiles for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on weekly_logs for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on weekly_log_campaign_entries for all using (private.has_client_access((select client_id from weekly_logs where id = weekly_log_id))) with check (private.has_client_access((select client_id from weekly_logs where id = weekly_log_id)));
create policy "client-scoped access" on recaps for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on recap_action_items for all using (private.has_client_access((select client_id from recaps where id = recap_id))) with check (private.has_client_access((select client_id from recaps where id = recap_id)));
create policy "client-scoped access" on recap_decisions for all using (private.has_client_access((select client_id from recaps where id = recap_id))) with check (private.has_client_access((select client_id from recaps where id = recap_id)));
create policy "client-scoped access" on integrations for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
create policy "client-scoped access" on ai_usage_log for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));

-- SOPs are org-wide, not per-client (see the table comment above). Fine-grained
-- "only Admin/CD or the original author can edit this format SOP" rules stay
-- application-level (SOPPage's canEdit/canDelete) rather than duplicated in SQL —
-- RLS here enforces the coarser, more important boundary: no cross-org access.
create policy "org members read sops" on sops for select using (organization_id = private.my_organization_id());
create policy "org members write sops" on sops for insert with check (organization_id = private.my_organization_id());
create policy "org members update sops" on sops for update using (organization_id = private.my_organization_id());
create policy "org members delete sops" on sops for delete using (organization_id = private.my_organization_id());
create policy "org members access sop images" on sop_images for all using (
  exists (select 1 from sops s where s.id = sop_id and s.organization_id = private.my_organization_id())
) with check (
  exists (select 1 from sops s where s.id = sop_id and s.organization_id = private.my_organization_id())
);

create policy "org members read announcements" on announcements for select using (organization_id = private.my_organization_id());
create policy "admin manages announcements" on announcements for insert with check (organization_id = private.my_organization_id() and private.my_role() = 'Admin');
