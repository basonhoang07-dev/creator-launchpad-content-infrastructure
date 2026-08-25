-- Stores the AI breakdown of a script's reference video (Instagram Reel or
-- TikTok URL) once analyzed: the full spoken transcript, and a structured
-- framework table (hook variations, intention, body & context, lesson —
-- each with why it creates a curiosity loop, what's locked to the original
-- creator vs what to swap in, tonality, and visual guidance). Cached on the
-- entry so it's not re-fetched/re-generated (both cost real API credits)
-- every time the script gets reopened.

alter table calendar_entries add column reference_transcript text;
alter table calendar_entries add column reference_framework jsonb;
