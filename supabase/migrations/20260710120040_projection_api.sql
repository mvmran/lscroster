-- Migration 0036 — Projection API (issue #135)
--
-- Read-only HTTP API for the church's Mac projection software, served by the
-- `projection-api` Edge Function. Two new tables back it:
--   * projection_api_keys — per-device API keys. Only the sha-256 hash is
--     stored; the raw key (lscp_ + 64 hex) is generated in the admin's browser
--     and shown once. Revoking a device = setting revoked_at, nothing else
--     changes. Admin-only via RLS; the Edge Function reads with service role.
--   * projection_api_requests — one row per API request. Feeds the per-key
--     rate limit (60/min) and doubles as the CCLI usage audit trail.
-- Plus songs.copyright: the multi-line CCLI copyright/attribution block the
-- projection app must display alongside lyrics.

-- projection_api_keys -----------------------------------------------------------

create table public.projection_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- First characters of the raw key (e.g. "lscp_a1b2c3") so an admin can tell
  -- keys apart without the secret ever being stored.
  key_prefix text not null,
  key_hash text not null unique,
  created_by uuid references public.people (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger projection_api_keys_set_updated_at
  before update on public.projection_api_keys
  for each row execute function public.set_updated_at();

alter table public.projection_api_keys enable row level security;

create policy "Admins manage projection API keys"
  on public.projection_api_keys for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- projection_api_requests -------------------------------------------------------
-- Written by the Edge Function (service role); admins may read it. The last
-- 60s of rows per key drive the rate limit, the rest is audit history.

create table public.projection_api_requests (
  id bigint generated always as identity primary key,
  key_id uuid references public.projection_api_keys (id) on delete set null,
  endpoint text not null,            -- 'plans' | 'lyrics'
  plan_id uuid,                      -- null for the plans list
  http_status integer not null,
  ip text,
  requested_at timestamptz not null default now()
);

create index projection_api_requests_key_time_idx
  on public.projection_api_requests (key_id, requested_at desc);

alter table public.projection_api_requests enable row level security;

create policy "Admins view projection API requests"
  on public.projection_api_requests for select
  to authenticated
  using (public.is_admin());

-- songs.copyright ---------------------------------------------------------------
-- Multi-line CCLI copyright block (e.g. "© 1982 Maranatha! Music" plus licence
-- lines). Shown by the projection app with the lyrics; nullable because the
-- library is filled in over time.

alter table public.songs
  add column if not exists copyright text;

comment on column public.songs.copyright is
  'Multi-line CCLI copyright/attribution text displayed alongside projected lyrics.';
