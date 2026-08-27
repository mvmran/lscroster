-- Migration 0040 — Multi-lingual lyric layers (issue #139)
--
-- A song's lyrics become four parallel layers. The existing `lyrics` column
-- keeps its meaning and its content: the primary singable text in Latin script
-- — for a multi-lingual song that is the transliteration, for an English song
-- it is simply the lyrics. It also keeps owning the section headers
-- ("[Verse 1]") and the line structure, so lyric-sections parsing, the
-- structure editor, the lyrics sheet, the setlist email and the projection API
-- all keep reading it unchanged.
--
-- The three new layers are line-parallel to it: line N of each layer belongs to
-- line N of `lyrics`, with blank rows where a line has no annotation. The app
-- pads shorter layers to the base's line count on save.
--
-- Nullable and additive, so there is no backfill and existing rows are already
-- correct. Layers live on the same versioned row as `lyrics`, so they version
-- atomically with it and a published plan's pin (plan_items.lyrics_id) captures
-- the whole set.

alter table public.song_arrangement_lyrics
  add column lyrics_native text,
  add column lyrics_meaning text,
  add column lyrics_chords text,
  add column native_language text;

-- Language of `lyrics_native` as a short ISO 639 code ('ml', 'hi'). Drives the
-- font stack and the pane label in the editor; null when the song has no
-- native-script layer.
alter table public.song_arrangement_lyrics
  add constraint song_arrangement_lyrics_native_language_check
  check (native_language is null or native_language ~ '^[a-z]{2,3}$');

comment on column public.song_arrangement_lyrics.lyrics is
  'Primary singable text, Latin script (the transliteration for a multi-lingual song). Owns the section headers and the line structure.';
comment on column public.song_arrangement_lyrics.lyrics_native is
  'Original-script lyrics (Malayalam, Hindi …), line-parallel to lyrics.';
comment on column public.song_arrangement_lyrics.lyrics_meaning is
  'English gloss, line-parallel to lyrics.';
comment on column public.song_arrangement_lyrics.lyrics_chords is
  'Chords, line-parallel to lyrics; rendered above the line in read views.';
comment on column public.song_arrangement_lyrics.native_language is
  'ISO 639 code for lyrics_native (''ml'', ''hi''); drives font stack and pane label.';
