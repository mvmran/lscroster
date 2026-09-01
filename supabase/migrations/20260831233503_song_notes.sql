-- Free-text notes on a song, for the things a leader remembers about it and
-- nowhere to put: the key it suits a male lead in and the key it suits a female
-- lead in, the tempo the band actually plays it at, "second verse is usually
-- dropped", who owns the pad patch.
--
-- Deliberately one free-text box rather than typed columns. The arrangement
-- already carries the key and tempo the app *uses* (song_arrangements.song_key,
-- .bpm, and plan-level overrides); this is the human note beside them, and the
-- point of it is the half of what a leader knows that no schema anticipates.
--
-- Not `tags`: a tag is a filter and has to be a word the whole library shares.
-- Not `copyright`: that is projected to the congregation. This is neither —
-- it stays inside the team.
--
-- Null for every existing song, so nothing needs backfilling.
--
-- No policy changes: RLS is already enabled on songs and its policies are
-- table-wide (leaders manage, authenticated read), so a new column inherits
-- them.

alter table public.songs
  add column if not exists notes text;

comment on column public.songs.notes is
  'Free-text notes for the team: suggested male/female keys, tempo, anything else worth remembering. Never projected.';
