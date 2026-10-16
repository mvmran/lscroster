-- Migration 0057 — A song's sequence, saved with its lyrics.
-- The sequence is the order a song is sung in — Intro, Verse, Verse 2, Chorus,
-- Chorus … — the strip of section names above the lyrics editor. The Lyrics
-- Sheet can now show each section once, so the sequence is what still tells
-- the band how the song goes.
--
-- It is kept on each lyrics version rather than on the arrangement: a
-- published plan pins the version it was published with (0033), and the
-- sequence it shows must be that version's, not whatever was saved since.
--
-- The app writes it on every save, as the section labels in order
-- (`{Intro,Verse,"Verse 2",Chorus,…}`). Null means a version saved before this
-- migration; readers then take the order from the lyrics' own headings, which
-- is what it would have held. No backfill — the heading grammar lives in the
-- app, and a second copy here would drift.
--
-- The table's grants (0050) cover the new column; RLS is unchanged.
-- Re-runnable.

alter table public.song_arrangement_lyrics
  add column if not exists sequence text[]
    check (sequence is null or cardinality(sequence) <= 200);

comment on column public.song_arrangement_lyrics.sequence is
  'The order the song is sung in, as section labels; null = not recorded (read the headings).';
