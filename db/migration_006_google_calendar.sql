-- Real Google Calendar integration, alongside the existing Drive one.
-- Mirrors google_drive_connections exactly: RLS enabled with NO policy, so
-- only server-side code using the service-role key can ever read a refresh
-- token — never the client directly.
-- Idempotent — safe to run even if already applied.

create table if not exists google_calendar_connections (
  client_id uuid primary key references clients(id) on delete cascade,
  google_email text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  created_at timestamptz default now()
);
alter table google_calendar_connections enable row level security;

-- Links an availability_blocks row to the Google Calendar event it pushed
-- (created once, then kept in sync on edit/delete). Null until the first
-- successful sync, or if the client has never connected Calendar.
alter table availability_blocks add column if not exists google_event_id text;
