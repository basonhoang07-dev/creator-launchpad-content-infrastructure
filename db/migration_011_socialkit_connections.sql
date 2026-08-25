-- Per-client SocialKit API key, powering "Break down this reference" on a
-- script (app/api/claude/analyze-reference). Each client brings their own
-- free-tier key (socialkit.dev — 20 breakdowns/month, no card) so the cost
-- doesn't sit on one org-wide subscription.
--
-- Mirrors google_drive_connections / google_calendar_connections exactly:
-- RLS enabled with NO policy, so only server-side code using the
-- service-role key can ever read the API key back out — never the browser,
-- and never another client sharing the same VA/Editor.
-- Idempotent — safe to run even if already applied.

create table if not exists socialkit_connections (
  client_id uuid primary key references clients(id) on delete cascade,
  api_key text not null,
  created_at timestamptz default now()
);
alter table socialkit_connections enable row level security;
