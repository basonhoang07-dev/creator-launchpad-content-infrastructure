-- Removes the browser extension's per-client key.
--
-- The extension it authenticated has been removed, so this column is a
-- live credential guarding nothing — the routes that accepted it are gone.
-- Dropped rather than left in place, because an unused secret is only ever
-- a liability.
--
-- Re-adding it is migration 020 verbatim if the extension ever comes back.

alter table clients drop column if exists extension_token;
