-- Migration 0014 — Scheduling rules, phase 1 (issue #32)
-- Stores the rules an auto-scheduler will later consume: per-person preferences
-- and availability, prefer/avoid/together pairings, mutually-exclusive teams,
-- and per-position headcount/level requirements. This migration is *storage +
-- the manual-editing UI's data only* — no validator and no engine yet.
--
-- One-off unavailability already exists as `blockout_dates`, so we reuse that
-- and add only recurring unavailability here. Proficiency stays two levels
-- (qualified/trainee) from issue #30, so `requires_level` allows 'qualified'.

-- enums -----------------------------------------------------------------------
create type public.scheduling_status as enum ('active', 'break', 'pending');
create type public.pairing_kind as enum ('prefer', 'avoid', 'together');
create type public.pairing_strength as enum ('hard', 'soft');

-- per-person scheduling preferences (one row per person) ----------------------
create table public.person_scheduling_prefs (
  person_id        uuid primary key references public.people (id) on delete cascade,
  min_gap_days     integer not null default 0,   -- min days between services
  max_per_month    integer,                       -- hard cap per calendar month
  target_per_month integer,                       -- soft minimum for keen volunteers
  max_consecutive  integer,                        -- max services in a row
  status           public.scheduling_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (min_gap_days >= 0),
  check (max_per_month is null or max_per_month >= 0),
  check (target_per_month is null or target_per_month >= 0),
  check (max_consecutive is null or max_consecutive >= 1)
);

create trigger person_scheduling_prefs_set_updated_at
  before update on public.person_scheduling_prefs
  for each row execute function public.set_updated_at();

-- recurring unavailability (e.g. "every 1st Sunday") --------------------------
create table public.person_recurring_unavailability (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people (id) on delete cascade,
  week_of_month integer,   -- 1..5, -1 for "last", null for "every"
  weekday       integer not null check (weekday between 0 and 6),  -- 0 = Sunday
  reason        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (week_of_month is null or week_of_month between 1 and 5 or week_of_month = -1)
);

create index person_recurring_unavailability_person_idx
  on public.person_recurring_unavailability (person_id);

create trigger person_recurring_unavailability_set_updated_at
  before update on public.person_recurring_unavailability
  for each row execute function public.set_updated_at();

-- prefer / avoid / together pairings ------------------------------------------
create table public.person_pairings (
  id        uuid primary key default gen_random_uuid(),
  person_a  uuid not null references public.people (id) on delete cascade,
  person_b  uuid not null references public.people (id) on delete cascade,
  kind      public.pairing_kind not null,
  strength  public.pairing_strength not null default 'soft',
  reason    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_a < person_b),          -- normalise the unordered pair
  unique (person_a, person_b, kind)
);

create index person_pairings_person_a_idx on public.person_pairings (person_a);
create index person_pairings_person_b_idx on public.person_pairings (person_b);

create trigger person_pairings_set_updated_at
  before update on public.person_pairings
  for each row execute function public.set_updated_at();

-- teams that cannot share a member in the same service ------------------------
create table public.team_exclusions (
  team_a uuid not null references public.teams (id) on delete cascade,
  team_b uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (team_a < team_b),
  primary key (team_a, team_b)
);

-- per-position headcount + level requirements --------------------------------
alter table public.positions
  add column min_count integer not null default 0,   -- mandatory == min_count >= 1
  add column max_count integer,                        -- null = unlimited
  add column requires_level text                       -- null, or a floor level
            check (requires_level in ('qualified')),
  add column fill_priority integer not null default 100, -- lower = fill first
  add constraint positions_count_range
    check (max_count is null or max_count >= min_count);

-- RLS: everyone signed in reads; admins/leaders manage (matches the rest of
-- the scheduling schema). ----------------------------------------------------
alter table public.person_scheduling_prefs enable row level security;
alter table public.person_recurring_unavailability enable row level security;
alter table public.person_pairings enable row level security;
alter table public.team_exclusions enable row level security;

create policy "Authenticated can view scheduling prefs"
  on public.person_scheduling_prefs for select to authenticated using (true);
create policy "Leaders manage scheduling prefs"
  on public.person_scheduling_prefs for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());

create policy "Authenticated can view recurring unavailability"
  on public.person_recurring_unavailability for select to authenticated using (true);
create policy "Leaders manage recurring unavailability"
  on public.person_recurring_unavailability for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());

create policy "Authenticated can view pairings"
  on public.person_pairings for select to authenticated using (true);
create policy "Leaders manage pairings"
  on public.person_pairings for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());

create policy "Authenticated can view team exclusions"
  on public.team_exclusions for select to authenticated using (true);
create policy "Leaders manage team exclusions"
  on public.team_exclusions for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());
