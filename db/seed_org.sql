-- ============================================================================
-- One-time bootstrap — run this AFTER schema.sql, and AFTER you've created
-- your own login and Adam's login under Authentication → Users (see
-- LAUNCH_CHECKLIST.md step 2 for exact click-by-click instructions).
--
-- This is ONE statement (built from chained CTEs) so you only need to
-- replace the placeholders below and click Run once — no copying IDs
-- between steps required.
--
-- Replace these 4 placeholders before running:
--   <YOUR_AUTH_USER_UID>   — your User UID from Authentication → Users
--   <ADAM_AUTH_USER_UID>   — Adam's User UID from Authentication → Users
--   'Your Name' / 'you@example.com'   — your display name + email
--   'Adam' / 'adam@example.com'       — his display name + email
-- ============================================================================

with new_org as (
  insert into organizations (id, name, owner_user_id)
  values (gen_random_uuid(), 'Creator Launchpad', '<YOUR_AUTH_USER_UID>')
  returning id
),
new_client as (
  insert into clients (id, organization_id, name, google_meet_email)
  select gen_random_uuid(), new_org.id, 'Adam', 'adam@example.com'
  from new_org
  returning id, organization_id
),
admin_profile as (
  insert into profiles (id, organization_id, name, email, role, status)
  select '<YOUR_AUTH_USER_UID>', new_org.id, 'Your Name', 'you@example.com', 'Admin', 'approved'
  from new_org
  returning id
)
insert into profiles (id, organization_id, client_id, name, email, role, status, google_meet_email)
select '<ADAM_AUTH_USER_UID>', new_client.organization_id, new_client.id, 'Adam', 'adam@example.com', 'Client', 'approved', 'adam@example.com'
from new_client;

-- ============================================================================
-- Sanity check — select all of the text below (from the next line to the
-- bottom of the file) and click Run again to confirm both rows look right.
-- You should see 2 rows: yourself as Admin, Adam as Client, with his row
-- showing "Adam" under client_name.
-- ============================================================================
-- select p.name, p.role, p.status, p.email, c.name as client_name
-- from profiles p
-- left join clients c on c.id = p.client_id
-- order by p.role;
