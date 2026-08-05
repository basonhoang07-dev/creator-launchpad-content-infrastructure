-- Adds the column for bot-based Discord delivery (POST /channels/{id}/messages
-- as your existing full-access bot) alongside the older webhook-URL path.
-- Safe to run on the already-provisioned live database.

alter table clients add column if not exists discord_channel_id text;
