-- Migration 0011 — Song arrangements (issue #24)
-- Each song gains one or more named arrangements, each with its own key, BPM and
-- meter. Every song has exactly one "Default" arrangement, auto-created on insert
-- and not directly deletable. The song's former default_key/bpm move into that
-- Default arrangement; CCLI stays on the song (shown beside the author).

create table public.song_arrangements (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  name text not null default 'Default',
  song_key text,
  bpm integer check (bpm is null or bpm > 0),
  meter text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, name)
);

create index song_arrangements_song_idx on public.song_arrangements (song_id);
-- At most one default arrangement per song.
create unique index song_arrangements_one_default_idx
  on public.song_arrangements (song_id) where is_default;

create trigger song_arrangements_set_updated_at
  before update on public.song_arrangements
  for each row execute function public.set_updated_at();

-- Backfill: every existing song gets a Default arrangement carrying its current
-- key and BPM. (Runs before the columns are dropped below.)
insert into public.song_arrangements (song_id, name, song_key, bpm, is_default, sort_order)
select id, 'Default', default_key, bpm, true, 0
from public.songs;

-- New songs get a Default arrangement automatically, so the invariant
-- "every song has a Default" holds for every insert path (UI, import, seed).
create function public.create_default_arrangement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.song_arrangements (song_id, name, is_default, sort_order)
  values (new.id, 'Default', true, 0);
  return new;
end;
$$;

create trigger songs_create_default_arrangement
  after insert on public.songs
  for each row execute function public.create_default_arrangement();

-- Guard: the Default arrangement can't be deleted directly. Cascade deletes from
-- removing the parent song are still allowed — by the time this fires the song
-- row is already gone, so the existence check is false and the cascade proceeds.
create function public.protect_default_arrangement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_default and exists (select 1 from public.songs where id = old.song_id) then
    raise exception 'The default arrangement cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger song_arrangements_protect_default
  before delete on public.song_arrangements
  for each row execute function public.protect_default_arrangement();

-- The key and BPM now live on arrangements; CCLI stays on the song.
alter table public.songs drop column default_key;
alter table public.songs drop column bpm;

-- RLS: same as songs — everyone signed in can read; leaders/admins manage.
alter table public.song_arrangements enable row level security;

create policy "Authenticated can view song arrangements"
  on public.song_arrangements for select
  to authenticated
  using (true);

create policy "Leaders manage song arrangements"
  on public.song_arrangements for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
