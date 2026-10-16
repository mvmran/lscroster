-- Migration 0051 — Several reference recordings per arrangement.
-- An arrangement followed one recording (`reference_url`, 0034 worship_setlist);
-- bands often follow a studio take and a live one, or a tutorial beside the
-- original. `reference_urls` holds them in the order the song page lists them:
-- the first is the one the set-list email and the Lyrics Sheet lead with.
--
-- `reference_url` is left in place, no longer read or written by the app, so an
-- older bundle or Edge Function still running during an upgrade keeps working.
-- Drop it in a later release.
--
-- No new table, so no new grants: the column is covered by the table's grants.
-- Re-runnable.

-- 1. Column ----------------------------------------------------------------------
alter table public.song_arrangements
  add column if not exists reference_urls text[] not null default '{}';

-- Every link is http(s) — the app validates on save and only ever renders an
-- http(s) href, and this keeps any other write path to the same rule. A check
-- constraint can't hold a subquery, hence the helper.
create or replace function public.all_http_urls(urls text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(u ~* '^https?://\S+$'), true) from unnest(urls) as u
$$;

alter table public.song_arrangements
  drop constraint if exists song_arrangements_reference_urls_check;
alter table public.song_arrangements
  add constraint song_arrangements_reference_urls_check
  check (cardinality(reference_urls) <= 10 and public.all_http_urls(reference_urls));

-- 2. Backfill ----------------------------------------------------------------------
-- Only a valid link moves across; anything else was never rendered as a link.
update public.song_arrangements
set reference_urls = array[btrim(reference_url)]
where reference_urls = '{}'
  and btrim(reference_url) ~* '^https?://\S+$';

comment on column public.song_arrangements.reference_url is
  'Deprecated by reference_urls (0051); no longer read or written. Drop in a later release.';
