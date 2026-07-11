-- Migration 0037 — Conditional relationship rules (issue #113)
-- "If <the person assigned to position A matches an attribute condition> then
-- <minimum headcounts on other position(s)>". Design: docs/DESIGN-conditional-rules.md.
--
-- Storage only — evaluation is client-side, in the shared resolver
-- (src/features/scheduling/conditional-rules.ts), which feeds the same
-- effective-minimum indirection the validator and auto-scheduler already read
-- (coalesce(plan override, fired rules max, positions.min_count)).
--
-- The trigger attribute vocabulary starts at just 'sex' (a new nullable enum
-- on people); the CHECK constraint widens when new attributes land, without a
-- rule-schema change. Effects are min-count-only in v1 (max is a follow-up).
-- No ELSE branch: the "else" case is a second rule, and the base min_count is
-- the "no rule fired" default.

-- the trigger attribute --------------------------------------------------------
create type public.person_sex as enum ('male', 'female');

alter table public.people
  add column sex public.person_sex;

-- Migration 0026 replaced the blanket SELECT on people with column-level
-- grants, so every new column needs granting explicitly. Sex is not contact
-- info — every signed-in user reads it (rule badges evaluate client-side for
-- anyone viewing a plan), so it joins the safe-columns list, unmasked.
grant select (sex) on public.people to authenticated;

-- Append it to the masked directory view too (create or replace requires new
-- columns at the end). Body/masking otherwise identical to migration 0026.
create or replace view public.people_directory as
  select
    p.id,
    p.first_name,
    p.last_name,
    p.role,
    p.status,
    p.photo_url,
    p.notes,
    p.auth_user_id,
    p.managed_by_person_id,
    p.managed_accepted_at,
    p.has_email,
    p.created_at,
    p.updated_at,
    case when public.can_view_contact(p.id) then p.email else null end as email,
    case when public.can_view_contact(p.id) then p.phone else null end as phone,
    case when public.can_view_contact(p.id) then p.birthday else null end as birthday,
    p.sex
  from public.people p
  where
    p.status = 'active'
    or public.is_admin_or_leader()
    or p.auth_user_id = (select auth.uid())
    or public.manages_person(p.id);

-- rule definitions --------------------------------------------------------------
create table public.conditional_rules (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  -- null = the rule applies to plans of every service type
  service_type_id     uuid references public.service_types (id) on delete cascade,
  trigger_position_id uuid not null references public.positions (id) on delete cascade,
  trigger_attribute   text not null check (trigger_attribute in ('sex')),
  trigger_value       text not null,
  -- hard = unmet rule is a publish-blocking error (overridable with a typed
  -- reason, like any other error); soft = warning. Reuses the pairing enum.
  strength            public.pairing_strength not null default 'hard',
  enabled             boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index conditional_rules_trigger_position_idx
  on public.conditional_rules (trigger_position_id);

create trigger conditional_rules_set_updated_at
  before update on public.conditional_rules
  for each row execute function public.set_updated_at();

-- one row per downstream position the rule constrains ---------------------------
create table public.conditional_rule_effects (
  id                 uuid primary key default gen_random_uuid(),
  rule_id            uuid not null references public.conditional_rules (id) on delete cascade,
  target_position_id uuid not null references public.positions (id) on delete cascade,
  min_count          integer not null check (min_count >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (rule_id, target_position_id)
);

create index conditional_rule_effects_rule_idx
  on public.conditional_rule_effects (rule_id);

create trigger conditional_rule_effects_set_updated_at
  before update on public.conditional_rule_effects
  for each row execute function public.set_updated_at();

-- per-plan "this rule doesn't apply here" ---------------------------------------
create table public.plan_rule_mutes (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  rule_id    uuid not null references public.conditional_rules (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, rule_id)
);

-- RLS: everyone signed in reads (rules explain badges everyone sees); rules
-- span teams, so management is admin-or-leader like person_pairings, not
-- per-team can_manage_team. -----------------------------------------------------
alter table public.conditional_rules enable row level security;
alter table public.conditional_rule_effects enable row level security;
alter table public.plan_rule_mutes enable row level security;

create policy "Authenticated can view conditional rules"
  on public.conditional_rules for select to authenticated using (true);
create policy "Leaders manage conditional rules"
  on public.conditional_rules for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());

create policy "Authenticated can view conditional rule effects"
  on public.conditional_rule_effects for select to authenticated using (true);
create policy "Leaders manage conditional rule effects"
  on public.conditional_rule_effects for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());

create policy "Authenticated can view plan rule mutes"
  on public.plan_rule_mutes for select to authenticated using (true);
create policy "Leaders manage plan rule mutes"
  on public.plan_rule_mutes for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());
