-- "Viral Alert": track a top-performing creator per brand board, pull their
-- recent videos, and flag one whose view count is climbing fast (default
-- 10k views/24h) on Home and in the client's Discord 1-on-1 channel.
--
-- Two tables: the creators being watched, and a per-video snapshot used to
-- measure velocity between checks. Both client-scoped and RLS'd the same way
-- as the rest of the content tables (private.has_client_access), since
-- there's no credential here — just public profile data.

create table if not exists tracked_creators (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  -- Which brand board this creator is a reference for. Null = tracked for
  -- the client generally, not tied to one campaign.
  brand text,
  platform text not null check (platform in ('tiktok', 'instagram')),
  profile_url text not null,
  handle text,
  -- Views-gained-per-24h that counts as "going viral" for THIS creator — a
  -- 2M-follower account clears 10k trivially, a small one doesn't, so it's
  -- per-creator rather than one global number.
  viral_threshold bigint not null default 10000,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  unique (client_id, platform, profile_url)
);
alter table tracked_creators enable row level security;

-- One row per video seen on a tracked creator's profile. views/checked_at
-- hold the newest reading and previous_* the one before it, which is what
-- the velocity math compares — keeping just two points (not full history)
-- is enough to answer "how fast is this climbing right now" and keeps the
-- table from growing unbounded per video.
create table if not exists tracked_creator_videos (
  id uuid primary key default gen_random_uuid(),
  tracked_creator_id uuid references tracked_creators(id) on delete cascade not null,
  video_id text not null,
  url text,
  description text,
  thumbnail text,
  posted_at timestamptz,
  views bigint default 0,
  likes bigint default 0,
  checked_at timestamptz default now(),
  previous_views bigint,
  previous_checked_at timestamptz,
  -- Set once a viral alert has fired for this video, so the same video never
  -- alerts twice. Null = never alerted.
  alerted_at timestamptz,
  -- The measured views/24h at the moment it alerted, so the UI and the
  -- Discord post can say what actually triggered it.
  alerted_velocity bigint,
  first_seen_at timestamptz default now(),
  unique (tracked_creator_id, video_id)
);
alter table tracked_creator_videos enable row level security;

create index if not exists tracked_creator_videos_creator_idx on tracked_creator_videos (tracked_creator_id);
create index if not exists tracked_creators_client_idx on tracked_creators (client_id);

drop policy if exists "client-scoped access" on tracked_creators;
create policy "client-scoped access" on tracked_creators for all
  using (private.has_client_access(client_id))
  with check (private.has_client_access(client_id));

drop policy if exists "client-scoped access" on tracked_creator_videos;
create policy "client-scoped access" on tracked_creator_videos for all
  using (private.has_client_access((select client_id from tracked_creators where id = tracked_creator_id)))
  with check (private.has_client_access((select client_id from tracked_creators where id = tracked_creator_id)));
