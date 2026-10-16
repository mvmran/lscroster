-- Migration 0054 — Each person's pad sound.
-- The pad that plays a song's key (song page, a plan's Edit song, the Lyrics
-- Sheet's Pad bubble) is synthesised from a handful of settings — waveform,
-- filter, reverb, voicing… Each person can pick a preset or tune their own at
-- Settings → Pad sound, and it follows them to every device, so it lives here
-- rather than in the browser.
--
-- `pad` holds those settings as one JSON object; the app validates it (and
-- falls back to the default, "Dark Warm", for anything it can't read), so a
-- newer app adding a setting needs no migration. No row = the default.
--
-- Private to its owner: nobody else — admins included — has any reason to read
-- or change how someone else's pad sounds. Re-runnable.

create table if not exists public.person_sound_prefs (
  person_id  uuid primary key references public.people (id) on delete cascade,
  pad        jsonb not null check (jsonb_typeof(pad) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists person_sound_prefs_set_updated_at on public.person_sound_prefs;
create trigger person_sound_prefs_set_updated_at
  before update on public.person_sound_prefs
  for each row execute function public.set_updated_at();

alter table public.person_sound_prefs enable row level security;

drop policy if exists "People manage their own sound prefs" on public.person_sound_prefs;
create policy "People manage their own sound prefs"
  on public.person_sound_prefs for all
  to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());

-- Data API access (Supabase no longer grants it automatically; see 0050). RLS
-- above does the real gating: anon matches no policy, so reaches no row.
grant select, insert, update, delete on public.person_sound_prefs
  to anon, authenticated, service_role;

comment on table public.person_sound_prefs is
  'Per-person sound settings. pad: the pad synth settings (JSON); no row = the default pad.';
