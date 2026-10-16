-- Migration 0056 — How loud each person's click is.
-- The metronome (song page, a plan's Edit song, the Lyrics Sheet's Click
-- bubble) played at one fixed loudness, which could drown the pad. Each person
-- now sets their click volume at Settings → Sounds, beside their pad.
--
-- `click_level` is a fraction of the original click's loudness: 1 is as loud
-- as it used to be, the default 0.6 sits under the default pad. It is its own
-- number, not a share of the pad's level: the click often plays alone.
--
-- Someone may set the click before ever saving a pad, so `pad` gets a default:
-- `{}`, which the app reads as "the default pad" — the same as having no row.
--
-- The table's grants (0054) cover the new column, and its RLS — own row only —
-- is unchanged. Re-runnable.

alter table public.person_sound_prefs
  add column if not exists click_level real not null default 0.6
    check (click_level >= 0 and click_level <= 1);

alter table public.person_sound_prefs alter column pad set default '{}'::jsonb;

comment on column public.person_sound_prefs.click_level is
  'Metronome volume, 0–1 of the original click; default 0.6.';
