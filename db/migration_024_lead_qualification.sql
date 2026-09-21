-- What the new lead-magnet quiz asks that the old one didn't.
--
-- The funnel went from three questions to six plus a country, and the extra
-- answers are the ones that actually decide how a call goes: where they are,
-- what they earn now, what they can spend, and how much time they have. All
-- of it was being collected and thrown away.
--
-- Stored as the labels the funnel displayed rather than its internal codes,
-- same as the existing quiz columns — a human reads these off a call sheet,
-- and "$500-2k/mo" beats "500to2k" every time.

-- Where they are. country is the display name, country_iso the two-letter
-- code — the name is what a caller reads, the code is what you group by
-- without worrying about "UK" vs "United Kingdom".
alter table leads add column if not exists country text;
alter table leads add column if not exists country_iso text;

-- 1, 2 or 3. The roadmap quotes T1 rates and assumes T1 payment rails, so
-- someone outside that market is told plainly before they start and the row
-- is tagged here. This is not a quality score — it is a note that the deal
-- sizes in the roadmap will not match what they can actually charge, which
-- is worth knowing before you ring them and quote numbers.
alter table leads add column if not exists market_tier smallint;

-- What they make from UGC today, and what they can put into tools and
-- talent. Kept separate because they answer different questions: the first
-- is whether this person has proven anything yet, the second is whether
-- they can act on advice that costs money.
alter table leads add column if not exists income_band text;
alter table leads add column if not exists budget_band text;

-- Hours a week. The roadmap is nine days of work on a fourteen-day clock,
-- so this is the single best predictor of whether they'll finish it.
alter table leads add column if not exists hours_band text;

-- Which of the three phases their roadmap opened on, as the funnel computed
-- it. Stored rather than recomputed so the call sheet shows what the lead
-- was actually shown — if the routing rules change later, old rows still
-- reflect the plan that person received.
alter table leads add column if not exists entry_phase smallint;

-- Callers filter by tier constantly once there is any non-T1 volume, and
-- the table is scanned per-org, so the index carries the org with it.
create index if not exists leads_org_tier_idx on leads (organization_id, market_tier);
