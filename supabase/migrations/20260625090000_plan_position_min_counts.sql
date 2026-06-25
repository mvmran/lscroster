-- Migration 0025 — per-plan & per-template minimum-required overrides (issue #110)
-- The "Min required" stepper on the plan page (#71) and Matrix (#109) used to
-- edit `positions.min_count` directly, which is the team-wide default — so
-- changing it for one plan changed it for EVERY plan. Store the override per
-- plan instead (and mirror it onto templates, as #73 did for items/times), and
-- fall back to the team default when no override row exists.
--
-- Effective minimum for a (plan, position):
--   coalesce(plan_position_min_counts.min_count, positions.min_count)
-- Computed client-side in buildPlanValidation / buildEngineState — these tables
-- are just storage.

create table public.plan_position_min_counts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  min_count integer not null default 0 check (min_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, position_id)
);

create index plan_position_min_counts_plan_idx
  on public.plan_position_min_counts (plan_id);

create trigger plan_position_min_counts_set_updated_at
  before update on public.plan_position_min_counts
  for each row execute function public.set_updated_at();

alter table public.plan_position_min_counts enable row level security;

-- Read is broad (like `positions`): everyone who can see a plan also computes
-- its coverage badges, and a minimum-required number isn't sensitive.
create policy "Authenticated can view plan position min counts"
  on public.plan_position_min_counts for select
  to authenticated
  using (true);

-- Writes are per-team (matches the assignment/position write policies from
-- migration 0023): admins, plus the position's team leader, may set an override.
create policy "Team leaders manage plan position min counts"
  on public.plan_position_min_counts for all
  to authenticated
  using (
    exists (
      select 1 from public.positions p
      where p.id = plan_position_min_counts.position_id
        and public.can_manage_team(p.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.positions p
      where p.id = plan_position_min_counts.position_id
        and public.can_manage_team(p.team_id)
    )
  );

-- Templates carry the override too, so a plan created from a template restores
-- the per-position minimums. Same access model as plan_template_items/_times:
-- a planning tool, leaders/admins only.
create table public.plan_template_position_min_counts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_templates (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  min_count integer not null default 0 check (min_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, position_id)
);

create index plan_template_position_min_counts_template_idx
  on public.plan_template_position_min_counts (template_id);

create trigger plan_template_position_min_counts_set_updated_at
  before update on public.plan_template_position_min_counts
  for each row execute function public.set_updated_at();

alter table public.plan_template_position_min_counts enable row level security;

create policy "Leaders manage plan template position min counts"
  on public.plan_template_position_min_counts for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
