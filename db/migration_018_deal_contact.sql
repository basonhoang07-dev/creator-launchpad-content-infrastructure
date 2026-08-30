-- Who to DM about a deal, and the end of the claims experiment.
--
-- The board originally let a client mark themselves "interested" and showed
-- Akira the list. That's the wrong shape: these deals aren't his to hand
-- out — they're posted by campaign managers in a shared server, and a
-- creator gets one by DMing the person who posted it. Marking interest in
-- the portal did nothing that moved a client closer to the deal, and the
-- Admin-side "Nobody yet" just advertised that.
--
-- So the board now tells a client exactly who to message. The contact is
-- whoever posted in Discord, unless the post names someone else to reach.
--
-- Dropped rather than left unused: the claims table was a day old, had no
-- rows, and an orphan table with live RLS policies is worse than none.

alter table brand_opportunities add column if not exists contact_discord_id text;
alter table brand_opportunities add column if not exists contact_discord_username text;

drop table if exists brand_opportunity_claims;
