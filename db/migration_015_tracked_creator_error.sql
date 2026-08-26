-- Why a tracked creator's last check produced nothing.
--
-- Instagram restricts some profiles outright (private, or age/region
-- gated); the scraper returns an error for those instead of reels, and no
-- amount of re-checking will change that. Without somewhere to keep the
-- reason, such a creator just sits in the list reading "checked never"
-- forever, which looks like the feature is broken rather than like the
-- profile being unreadable.
--
-- Cleared on the next successful check, so it only ever describes the
-- current state.

alter table tracked_creators add column if not exists last_error text;
