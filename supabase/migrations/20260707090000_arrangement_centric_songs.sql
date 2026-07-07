-- Migration 0033 — Arrangement-centric songs (issue #130)
--
-- song_arrangements becomes the record a plan uses. A new junction table
-- song_arrangement_songs replaces song_arrangements.song_id, so one arrangement
-- can be linked to several songs (a medley) and appears under each of them.
-- Lyrics move off songs into versioned song_arrangement_lyrics rows; published
-- plans pin the version they were published with (plan_items.lyrics_id) so a
-- later edit never rewrites their lyrics sheet. song_attachments, plan_items and
-- plan_template_items all re-point from songs to song_arrangements.
--
-- Upgrade notes: existing attachments land on each song's Default arrangement;
-- every arrangement gets a version-1 copy of its song's current lyrics; existing
-- plan items point at their song's Default arrangement, and items on published
-- plans are pinned to version 1. Storage paths are untouched.

-- song_arrangement_songs -------------------------------------------------------------
-- Which song(s) an arrangement belongs to. Default/normal arrangements have one
-- row; medleys have two or more (sort_order = display order of the songs).

create table public.song_arrangement_songs (
  arrangement_id uuid not null references public.song_arrangements (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (arrangement_id, song_id)
);

create index song_arrangement_songs_song_idx
  on public.song_arrangement_songs (song_id);

-- Every existing arrangement belongs to exactly its old song.
insert into public.song_arrangement_songs (arrangement_id, song_id, sort_order)
select id, song_id, 0
from public.song_arrangements;

-- song_arrangement_lyrics ------------------------------------------------------------
-- Versioned lyrics per arrangement. The latest version is the "current" lyrics;
-- published plans pin the version they used via plan_items.lyrics_id.

create table public.song_arrangement_lyrics (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.song_arrangements (id) on delete cascade,
  version integer not null default 0,
  lyrics text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (arrangement_id, version)
);

create index song_arrangement_lyrics_arrangement_idx
  on public.song_arrangement_lyrics (arrangement_id, version desc);

create trigger song_arrangement_lyrics_set_updated_at
  before update on public.song_arrangement_lyrics
  for each row execute function public.set_updated_at();

-- Versions are always assigned server-side: max existing + 1 per arrangement.
create function public.assign_lyrics_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select coalesce(max(version), 0) + 1 into new.version
  from public.song_arrangement_lyrics
  where arrangement_id = new.arrangement_id;
  return new;
end;
$$;

create trigger song_arrangement_lyrics_assign_version
  before insert on public.song_arrangement_lyrics
  for each row execute function public.assign_lyrics_version();

-- Backfill: every arrangement of a song gets a v1 copy of the song's current
-- lyrics (all arrangements displayed the song's lyrics before this migration,
-- so nothing visibly changes; they diverge independently from here on).
insert into public.song_arrangement_lyrics (arrangement_id, lyrics)
select a.id, s.lyrics
from public.song_arrangements a
join public.songs s on s.id = a.song_id
where s.lyrics is not null and btrim(s.lyrics) <> '';

-- plan_items ------------------------------------------------------------------------
-- Plans now reference the arrangement being played. lyrics_id NULL means
-- "follow the arrangement's latest lyrics"; publishing pins it (see
-- pin_plan_lyrics below), unpublishing clears it again.

alter table public.plan_items
  add column arrangement_id uuid references public.song_arrangements (id) on delete set null,
  add column lyrics_id uuid references public.song_arrangement_lyrics (id) on delete set null;

update public.plan_items pi
set arrangement_id = a.id
from public.song_arrangements a
where a.song_id = pi.song_id and a.is_default;

-- Items on already-published plans pin the (only) version so future edits
-- can't rewrite them.
update public.plan_items pi
set lyrics_id = l.id
from public.plans p, public.song_arrangement_lyrics l
where p.id = pi.plan_id
  and p.status = 'published'
  and l.arrangement_id = pi.arrangement_id;

-- song_usage reads plan_items.song_id; rebuilt over the junction further down.
drop view public.song_usage;

alter table public.plan_items drop column song_id;

create index plan_items_arrangement_idx on public.plan_items (arrangement_id);

-- plan_template_items ----------------------------------------------------------------
-- Templates follow the latest lyrics (no pin) — plans made from them are drafts.

alter table public.plan_template_items
  add column arrangement_id uuid references public.song_arrangements (id) on delete set null;

update public.plan_template_items ti
set arrangement_id = a.id
from public.song_arrangements a
where a.song_id = ti.song_id and a.is_default;

alter table public.plan_template_items drop column song_id;

-- song_attachments -------------------------------------------------------------------
-- Attachments now hang off an arrangement. Existing files belong to the song's
-- Default arrangement; storage paths are unchanged (policies don't read paths).

alter table public.song_attachments
  add column arrangement_id uuid references public.song_arrangements (id) on delete cascade;

update public.song_attachments sa
set arrangement_id = a.id
from public.song_arrangements a
where a.song_id = sa.song_id and a.is_default;

alter table public.song_attachments alter column arrangement_id set not null;
alter table public.song_attachments drop column song_id;

create index song_attachments_arrangement_idx
  on public.song_attachments (arrangement_id);

-- Triggers ---------------------------------------------------------------------------

-- New songs still auto-create their Default arrangement — now with a junction
-- row instead of a song_id column.
create or replace function public.create_default_arrangement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  arr_id uuid;
begin
  insert into public.song_arrangements (name, is_default, sort_order)
  values ('Default', true, 0)
  returning id into arr_id;
  insert into public.song_arrangement_songs (arrangement_id, song_id, sort_order)
  values (arr_id, new.id, 0);
  return new;
end;
$$;

-- The Default arrangement can't be deleted while it still belongs to a song.
-- When its last junction link disappears (song deleted / cascade), the orphan
-- cleanup below is allowed through because no links remain.
create or replace function public.protect_default_arrangement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_default and exists (
    select 1 from public.song_arrangement_songs where arrangement_id = old.id
  ) then
    raise exception 'The default arrangement cannot be deleted';
  end if;
  return old;
end;
$$;

-- A Default's single song link can't be removed directly. During a song delete
-- the parent row is already gone when the cascade fires, so the exists() check
-- lets the cascade proceed (same trick as protect_default_arrangement).
create function public.protect_default_arrangement_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.song_arrangements a
    where a.id = old.arrangement_id and a.is_default
  ) and exists (select 1 from public.songs s where s.id = old.song_id) then
    raise exception 'The default arrangement''s song link cannot be removed';
  end if;
  return old;
end;
$$;

create trigger song_arrangement_songs_protect_default
  before delete on public.song_arrangement_songs
  for each row execute function public.protect_default_arrangement_link();

-- An arrangement with no songs left is meaningless: deleting a song removes its
-- junction rows, and any arrangement left with zero links is deleted too (its
-- attachments and lyrics cascade). Medleys survive via their other song(s).
create function public.cleanup_orphan_arrangement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.song_arrangements a
  where a.id = old.arrangement_id
    and not exists (
      select 1 from public.song_arrangement_songs s
      where s.arrangement_id = old.arrangement_id
    );
  return old;
end;
$$;

create trigger song_arrangement_songs_cleanup_orphans
  after delete on public.song_arrangement_songs
  for each row execute function public.cleanup_orphan_arrangement();

-- Defaults are one-song by definition (medleys are always non-default), and a
-- song can only have one Default.
create function public.limit_default_arrangement_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.song_arrangements a
    where a.id = new.arrangement_id and a.is_default
  ) then
    if exists (
      select 1 from public.song_arrangement_songs s
      where s.arrangement_id = new.arrangement_id
    ) then
      raise exception 'A default arrangement can only be linked to one song';
    end if;
    if exists (
      select 1
      from public.song_arrangement_songs s
      join public.song_arrangements a2 on a2.id = s.arrangement_id
      where s.song_id = new.song_id and a2.is_default
    ) then
      raise exception 'This song already has a default arrangement';
    end if;
  end if;
  return new;
end;
$$;

create trigger song_arrangement_songs_limit_default
  before insert on public.song_arrangement_songs
  for each row execute function public.limit_default_arrangement_links();

-- The junction replaces song_arrangements.song_id (this also drops the old
-- unique (song_id, name) and one-default-per-song indexes; per-song name
-- uniqueness is now checked in the app).
alter table public.song_arrangements drop column song_id;

-- Lyrics now live on arrangements.
alter table public.songs drop column lyrics;

-- Views ------------------------------------------------------------------------------

-- Same shape as before, but a medley play now counts for every linked song
-- (CCLI reporting). security_invoker so members only see published plans.
create view public.song_usage
with (security_invoker = true) as
select
  sas.song_id,
  count(distinct pi.plan_id) as use_count,
  max(p.date) filter (where p.date <= current_date) as last_used,
  min(p.date) filter (where p.date > current_date) as next_scheduled
from public.plan_items pi
join public.song_arrangement_songs sas on sas.arrangement_id = pi.arrangement_id
join public.plans p on p.id = pi.plan_id
group by sas.song_id;

-- Flat per-play rows for the song history card and the usage report; includes
-- medley plays for each linked song.
create view public.song_plan_usage
with (security_invoker = true) as
select
  sas.song_id,
  pi.id as plan_item_id,
  pi.plan_id,
  pi.arrangement_id,
  pi.key_override,
  p.date,
  p.title as plan_title,
  p.status as plan_status,
  p.service_type_id,
  st.name as service_type_name
from public.plan_items pi
join public.song_arrangement_songs sas on sas.arrangement_id = pi.arrangement_id
join public.plans p on p.id = pi.plan_id
join public.service_types st on st.id = p.service_type_id;

-- Publishing pins each song item to its arrangement's latest lyrics version so
-- later edits can't rewrite a published plan. Security invoker: RLS decides who
-- may update the plan's items.
create function public.pin_plan_lyrics(p_plan_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.plan_items pi
  set lyrics_id = (
    select l.id
    from public.song_arrangement_lyrics l
    where l.arrangement_id = pi.arrangement_id
    order by l.version desc
    limit 1
  )
  where pi.plan_id = p_plan_id
    and pi.kind = 'song'
    and pi.arrangement_id is not null;
$$;

-- RLS --------------------------------------------------------------------------------

alter table public.song_arrangement_songs enable row level security;
alter table public.song_arrangement_lyrics enable row level security;

create policy "Authenticated can view song arrangement links"
  on public.song_arrangement_songs for select
  to authenticated
  using (true);

create policy "Leaders manage song arrangement links"
  on public.song_arrangement_songs for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "Authenticated can view song arrangement lyrics"
  on public.song_arrangement_lyrics for select
  to authenticated
  using (true);

create policy "Leaders manage song arrangement lyrics"
  on public.song_arrangement_lyrics for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
