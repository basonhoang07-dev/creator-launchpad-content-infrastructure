-- Tags each brand board with the broad content niche it operates in
-- (Fitness, Make Money Online, Study Tools, ...).
--
-- Lives on the campaign rather than on the tracked creator: a creator is
-- only ever watched *because* of a campaign, so tagging the campaign means
-- it's chosen once and every creator and viral alert underneath inherits
-- it. Tagging per-creator would mean re-picking the same value for each
-- competitor and letting them drift out of sync.
--
-- Powers the Admin "Viral Feed" — one cross-client view of everything
-- that's taken off, filterable by niche, so a format proven in one
-- client's niche can be turned into a Format SOP the whole roster can use.

alter table retainer_campaigns add column if not exists niche text;

create index if not exists retainer_campaigns_niche_idx on retainer_campaigns (niche);
