-- The view-bonus ladder, pulled out of the pay text into rows.
--
-- Nearly every one of these deals quotes a tier table — "1.2K = $30, 50K =
-- $130, 100K = $180, 1M = $730" — and it's the part a creator actually
-- reads, because it's what the deal is worth if a video lands. It was
-- surviving only as prose inside pay_summary, where it can't be laid out,
-- can't be compared between deals, and gets truncated on a card.
--
-- Stored as quoted, one entry per tier: {"views": 50000, "amountUsd": 130}.
-- Amounts are NOT normalised into deltas — these posts quote the total paid
-- at each threshold, and converting that into "+$100 more" would be
-- inventing a reading the post doesn't support.

alter table brand_opportunities add column if not exists bonus_tiers jsonb;
