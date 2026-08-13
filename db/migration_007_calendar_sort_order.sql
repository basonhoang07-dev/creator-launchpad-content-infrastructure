-- Adds manual ordering to the Content Calendar's script table. Previously
-- calendar_entries had no explicit order — rows came back in whatever order
-- Postgres happened to return them in (which looked alphabetical purely by
-- coincidence, not by design). This makes the default order = creation
-- order (oldest first, top to bottom) and lets the app persist drag/move
-- reordering afterward via simple swaps between adjacent rows.

alter table calendar_entries add column sort_order double precision;

-- Backfill existing rows using creation order, per client, so today's
-- calendars start out reading top-to-bottom the way they would have if this
-- column had existed from the start.
with ranked as (
  select id, row_number() over (partition by client_id order by created_at asc) as rn
  from calendar_entries
)
update calendar_entries
set sort_order = ranked.rn
from ranked
where calendar_entries.id = ranked.id;
