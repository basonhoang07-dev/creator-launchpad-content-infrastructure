-- Adds real Google Drive folder automation for content-calendar scripts.
-- Each client connects their OWN Drive via OAuth (Integrations page) — not a
-- shared service-account Drive, which would hit Google's "service accounts
-- have no storage quota on personal Gmail" wall the moment it tried to
-- create a folder. Idempotent — safe to run even if some pieces already
-- exist.

alter table retainer_campaigns add column if not exists drive_folder_id text;
alter table retainer_campaigns add column if not exists drive_folder_url text;

alter table calendar_entries add column if not exists drive_folder_url text;

alter table integrations add column if not exists connected_email text;

create table if not exists google_drive_connections (
  client_id uuid primary key references clients(id) on delete cascade,
  google_email text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  root_folder_id text,
  created_at timestamptz default now()
);
alter table google_drive_connections enable row level security;
-- No policies added on purpose — this table is only ever touched by the
-- service-role client from server routes, never the anon/authenticated key.
