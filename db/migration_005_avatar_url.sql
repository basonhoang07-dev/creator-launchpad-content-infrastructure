-- Adds a self-service profile picture, stored as a base64 data URI in the
-- same pattern as SOP images (sops.thumbnail_url) — no separate file storage
-- bucket needed for something this small.
-- Idempotent — safe to run even if already applied.

alter table profiles add column if not exists avatar_url text;
