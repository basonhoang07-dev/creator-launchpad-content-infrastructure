-- ============================================================================
-- Migration for an ALREADY-APPLIED schema.sql (your live project). Safe to
-- run once. Does three things:
--   1. Moves the RLS helper functions (my_organization_id/my_role/
--      has_client_access) into a `private` schema PostgREST doesn't expose,
--      and pins their search_path — fixes all 6 Supabase Advisor warnings.
--   2. Adds `access_requests` — the public "Request access" form now only
--      ever inserts here; no real Supabase Auth account or profile gets
--      created until an Admin approves it (app/api/admin/approve-request).
--   3. Adds `ai_usage_log` if you haven't already run that piece separately.
-- Idempotent — safe to run even if parts of this already happened.
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

create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now()
);
alter table access_requests enable row level security;

create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  route text not null,
  created_at timestamptz default now()
);
create index if not exists ai_usage_log_client_month_idx on ai_usage_log (client_id, created_at);
alter table ai_usage_log enable row level security;

-- Drop every existing policy that calls the old public.* functions, then
-- recreate all of them against private.*. (drop-if-exists makes this safe
-- to re-run even if some of these were already updated.)
drop policy if exists "authenticated users can read organizations" on organizations;
drop policy if exists "anyone can read organizations" on organizations;
create policy "anyone can read organizations" on organizations for select using (true);

drop policy if exists "org members read clients" on clients;
drop policy if exists "admins manage clients" on clients;
create policy "org members read clients" on clients for select using (organization_id = private.my_organization_id());
create policy "admins manage clients" on clients for all using (organization_id = private.my_organization_id() and private.my_role() = 'Admin') with check (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

drop policy if exists "org members read profiles" on profiles;
drop policy if exists "users insert their own profile" on profiles;
drop policy if exists "self or admin update profiles" on profiles;
drop policy if exists "admin deletes profiles" on profiles;
create policy "org members read profiles" on profiles for select using (id = auth.uid() or organization_id = private.my_organization_id());
create policy "self or admin update profiles" on profiles for update using (id = auth.uid() or (organization_id = private.my_organization_id() and private.my_role() = 'Admin'));
create policy "admin deletes profiles" on profiles for delete using (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

drop policy if exists "read own or admin-managed grants" on account_client_access;
drop policy if exists "admin manages grants" on account_client_access;
drop policy if exists "admin revokes grants" on account_client_access;
create policy "read own or admin-managed grants" on account_client_access for select using (
  profile_id = auth.uid() or exists (select 1 from profiles p where p.id = profile_id and p.organization_id = private.my_organization_id())
);
create policy "admin manages grants" on account_client_access for insert with check (
  private.my_role() = 'Admin' and exists (select 1 from profiles p where p.id = profile_id and p.organization_id = private.my_organization_id())
);
create policy "admin revokes grants" on account_client_access for delete using (
  private.my_role() = 'Admin' and exists (select 1 from profiles p where p.id = profile_id and p.organization_id = private.my_organization_id())
);

drop policy if exists "anyone can submit an access request" on access_requests;
drop policy if exists "admin reads access requests" on access_requests;
drop policy if exists "admin denies access requests" on access_requests;
drop policy if exists "admin deletes access requests" on access_requests;
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

drop policy if exists "client-scoped access" on retainer_campaigns;
create policy "client-scoped access" on retainer_campaigns for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on bonus_tiers;
create policy "client-scoped access" on bonus_tiers for all using (private.has_client_access((select client_id from retainer_campaigns where id = campaign_id))) with check (private.has_client_access((select client_id from retainer_campaigns where id = campaign_id)));
drop policy if exists "client-scoped access" on calendar_entries;
create policy "client-scoped access" on calendar_entries for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on calendar_comments;
create policy "client-scoped access" on calendar_comments for all using (private.has_client_access((select client_id from calendar_entries where id = entry_id))) with check (private.has_client_access((select client_id from calendar_entries where id = entry_id)));
drop policy if exists "client-scoped access" on calendar_trash;
create policy "client-scoped access" on calendar_trash for all using (private.has_client_access(((original_entry->>'client_id'))::uuid)) with check (private.has_client_access(((original_entry->>'client_id'))::uuid));
drop policy if exists "client-scoped access" on availability_blocks;
create policy "client-scoped access" on availability_blocks for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on templates;
create policy "client-scoped access" on templates for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on brand_profiles;
create policy "client-scoped access" on brand_profiles for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on weekly_logs;
create policy "client-scoped access" on weekly_logs for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on weekly_log_campaign_entries;
create policy "client-scoped access" on weekly_log_campaign_entries for all using (private.has_client_access((select client_id from weekly_logs where id = weekly_log_id))) with check (private.has_client_access((select client_id from weekly_logs where id = weekly_log_id)));
drop policy if exists "client-scoped access" on recaps;
create policy "client-scoped access" on recaps for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on recap_action_items;
create policy "client-scoped access" on recap_action_items for all using (private.has_client_access((select client_id from recaps where id = recap_id))) with check (private.has_client_access((select client_id from recaps where id = recap_id)));
drop policy if exists "client-scoped access" on recap_decisions;
create policy "client-scoped access" on recap_decisions for all using (private.has_client_access((select client_id from recaps where id = recap_id))) with check (private.has_client_access((select client_id from recaps where id = recap_id)));
drop policy if exists "client-scoped access" on integrations;
create policy "client-scoped access" on integrations for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));
drop policy if exists "client-scoped access" on ai_usage_log;
create policy "client-scoped access" on ai_usage_log for all using (private.has_client_access(client_id)) with check (private.has_client_access(client_id));

drop policy if exists "org members read sops" on sops;
drop policy if exists "org members write sops" on sops;
drop policy if exists "org members update sops" on sops;
drop policy if exists "org members delete sops" on sops;
create policy "org members read sops" on sops for select using (organization_id = private.my_organization_id());
create policy "org members write sops" on sops for insert with check (organization_id = private.my_organization_id());
create policy "org members update sops" on sops for update using (organization_id = private.my_organization_id());
create policy "org members delete sops" on sops for delete using (organization_id = private.my_organization_id());

drop policy if exists "org members access sop images" on sop_images;
create policy "org members access sop images" on sop_images for all using (
  exists (select 1 from sops s where s.id = sop_id and s.organization_id = private.my_organization_id())
) with check (
  exists (select 1 from sops s where s.id = sop_id and s.organization_id = private.my_organization_id())
);

drop policy if exists "org members read announcements" on announcements;
drop policy if exists "admin manages announcements" on announcements;
create policy "org members read announcements" on announcements for select using (organization_id = private.my_organization_id());
create policy "admin manages announcements" on announcements for insert with check (organization_id = private.my_organization_id() and private.my_role() = 'Admin');

-- Now that nothing references them anymore, drop the old exposed-in-public
-- versions — this is what actually resolves the Advisor warnings.
drop function if exists public.my_organization_id();
drop function if exists public.my_role();
drop function if exists public.has_client_access(uuid);
