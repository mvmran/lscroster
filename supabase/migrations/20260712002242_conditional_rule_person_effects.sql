-- Migration 0038 — person-identity conditions, person-specific effects and
-- cross-team "same person" mirroring for conditional rules (issue #113 follow-up).
-- Design: docs/DESIGN-conditional-rules.md §8 (extension).
--
-- Additive only — every existing row remains a valid ('sex', 'count') rule.
-- Evaluation stays client-side in the shared resolver; the DB stores shape.
--
-- Conditions grow two kinds alongside attribute matching:
--   'person' — fires when the trigger assignee IS a specific person
--   'any'    — fires when the trigger position has any (non-declined) assignee
--              (the mirror trigger: "whoever is on X…")
-- Effects grow a kind column:
--   'count'       — minimum headcount on the target (the existing behaviour)
--   'person'      — a specific person must be on the target
--   'same_person' — the matched trigger assignee(s) must also be on the target
--
-- Person references use ON DELETE SET NULL, not CASCADE: a deleted person must
-- not silently delete or mutate a rule. The resolver treats a null person ref
-- where the kind demands one as "broken" — the rule stops firing and the rules
-- card shows a "needs attention" badge instead of silent breakage.

-- conditions ---------------------------------------------------------------------
alter table public.conditional_rules
  alter column trigger_value drop not null;

alter table public.conditional_rules
  drop constraint conditional_rules_trigger_attribute_check;

alter table public.conditional_rules
  add constraint conditional_rules_trigger_attribute_check
  check (trigger_attribute in ('sex', 'person', 'any'));

alter table public.conditional_rules
  add column trigger_person_id uuid references public.people (id) on delete set null;

-- Shape coherence. 'person' cannot require trigger_person_id NOT NULL — the
-- SET NULL lifecycle above must be able to leave a (broken) row behind.
alter table public.conditional_rules
  add constraint conditional_rules_trigger_shape_check check (
    (trigger_attribute = 'sex' and trigger_value is not null and trigger_person_id is null)
    or (trigger_attribute = 'person' and trigger_value is null)
    or (trigger_attribute = 'any' and trigger_value is null and trigger_person_id is null)
  );

create index conditional_rules_trigger_person_idx
  on public.conditional_rules (trigger_person_id)
  where trigger_person_id is not null;

-- effects ------------------------------------------------------------------------
alter table public.conditional_rule_effects
  add column effect_kind text not null default 'count'
    check (effect_kind in ('count', 'person', 'same_person')),
  add column required_person_id uuid references public.people (id) on delete set null;

alter table public.conditional_rule_effects
  alter column min_count drop not null;

alter table public.conditional_rule_effects
  drop constraint conditional_rule_effects_min_count_check;

-- min_count belongs to 'count' rows only; person refs to 'person' rows only
-- (nullable there for the SET NULL broken state).
alter table public.conditional_rule_effects
  add constraint conditional_rule_effects_shape_check check (
    (effect_kind = 'count' and min_count is not null and min_count >= 0
      and required_person_id is null)
    or (effect_kind = 'person' and min_count is null)
    or (effect_kind = 'same_person' and min_count is null and required_person_id is null)
  );

-- One count floor and one same-person link per (rule, target); several distinct
-- required people may share a target ("Sam AND Sharon on Vocals").
alter table public.conditional_rule_effects
  drop constraint conditional_rule_effects_rule_id_target_position_id_key;

create unique index conditional_rule_effects_count_unique
  on public.conditional_rule_effects (rule_id, target_position_id)
  where effect_kind = 'count';
create unique index conditional_rule_effects_same_person_unique
  on public.conditional_rule_effects (rule_id, target_position_id)
  where effect_kind = 'same_person';
create unique index conditional_rule_effects_person_unique
  on public.conditional_rule_effects (rule_id, target_position_id, required_person_id)
  where effect_kind = 'person';

create index conditional_rule_effects_required_person_idx
  on public.conditional_rule_effects (required_person_id)
  where required_person_id is not null;

-- RLS: unchanged — the existing FOR ALL policies on both tables already cover
-- the new columns.
