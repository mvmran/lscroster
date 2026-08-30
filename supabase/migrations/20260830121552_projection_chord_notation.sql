-- Which chord notation the projection API sends (issue #139 follow-up).
--
-- Chords are stored as numbers of the key — the Nashville system, where a
-- chord is named by its degree ("1", "4", "6m") rather than its letter — so
-- one stored text reads correctly in whatever key a plan plays the song in.
-- In the app each person picks the notation they read; the projection feed
-- has no person to ask, and what it sends lands on a screen the whole music
-- team reads, so the choice belongs to the instance.
--
-- 'letters' is the default because that is what the projection API has always
-- emitted and what docs/PROJECTION-API.md documents: an instance upgrading to
-- this migration keeps sending exactly what its projection software already
-- parses, and only changes if an admin asks for numbers.

alter table public.church_settings
  add column if not exists projection_chord_notation text not null default 'letters'
    check (projection_chord_notation in ('letters', 'numbers'));

comment on column public.church_settings.projection_chord_notation is
  'Notation the projection API sends chords in: letters (G, Am) or numbers of the key (1, 6m). Stored chords are always numbers.';

-- No new RLS: church_settings is already anon-readable and admin-writable,
-- which is what the Settings control needs.
