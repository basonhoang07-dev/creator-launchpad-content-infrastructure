-- Cached transcript for a tracked video, kept with per-line timings.
--
-- Format SOP generation needs the TIMED segments, not just the flat text:
-- the transcript has no speaker labels, and the pauses between lines are
-- what make speaker turns inferable. calendar_entries.reference_transcript
-- only ever stored the flat blob, so there was nothing reusable and every
-- promotion spent a fresh SocialKit request — on a free tier that reports
-- credits already at zero.
--
-- Cached here rather than on calendar_entries because the alert row is the
-- thing being promoted, and one video can be promoted, deleted and
-- re-promoted while iterating on the SOP.

alter table tracked_creator_videos add column if not exists transcript text;
alter table tracked_creator_videos add column if not exists transcript_segments jsonb;
