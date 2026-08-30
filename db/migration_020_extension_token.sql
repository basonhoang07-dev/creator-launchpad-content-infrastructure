-- A per-client token so the browser extension can talk to the app.
--
-- The extension runs on instagram.com and tiktok.com, which means it has no
-- Supabase session to borrow — cookies are scoped to our own domain, and
-- shipping the anon key inside an extension would hand every installer a
-- key that reaches the whole API surface.
--
-- So: one opaque token per client, pasted into the extension once. It
-- authorises exactly two things (read this client's tracked creators, save
-- a video reference against them) via routes that check it explicitly, and
-- nothing else. Regenerating it revokes every copy, which is the whole
-- reason it isn't derived from anything.
--
-- Deliberately NOT readable through RLS: the extension routes look it up
-- with the service-role client, and no policy exposes the column to a
-- client-side query, so one client can't read another's token.

alter table clients add column if not exists extension_token text unique;

create index if not exists clients_extension_token_idx on clients (extension_token);
