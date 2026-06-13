-- Migration 0008 — Service type scheduling details (issue #11)
-- Adds frequency, the days of week a service runs, an end time, and the set
-- of teams a service type typically needs.

create type public.service_frequency as enum
  ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');

alter table public.service_types
  add column frequency public.service_frequency,
  -- ISO-ish day numbers, 0 = Sunday .. 6 = Saturday.
  add column days_of_week integer[] not null default '{}',
  add column end_time time;

-- Teams a service type requires (many-to-many with teams).
create table public.service_type_teams (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type_id, team_id)
);

create index service_type_teams_service_type_idx on public.service_type_teams (service_type_id);

create trigger service_type_teams_set_updated_at
  before update on public.service_type_teams
  for each row execute function public.set_updated_at();

-- RLS mirrors service_types: everyone signed in reads, only admins manage.
alter table public.service_type_teams enable row level security;

create policy "Authenticated can view service type teams"
  on public.service_type_teams for select
  to authenticated
  using (true);

create policy "Admins manage service type teams"
  on public.service_type_teams for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
