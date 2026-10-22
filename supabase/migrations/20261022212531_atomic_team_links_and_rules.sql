-- Migration 0065 — Team ↔ service-type links and conditional rules are each
-- saved in one transaction. Found by `/code-review`. Re-runnable.
--
-- All three were a delete followed by separate inserts from the browser, so an
-- insert that failed after the delete had landed left the data half-written:
--   * a team with no service-type links serves EVERY service type;
--   * a rule with no effects stays enabled and silently does nothing (and a
--     new rule whose effects failed was left behind, so a retry duplicated it).
-- Editing a team (even a rename) also re-inserted its links without
-- `sort_order`, sending the team to the top of each service type's order.
--
-- One function call is one transaction, so now all of it lands or none does.
-- Security invoker (the default, spelled out): the tables' own RLS still
-- decides who may write (admins and coordinators).

-- The service types a team serves (empty = all). Links that stay keep their
-- place in each service type's order; a new link goes to the end of it.
create or replace function public.replace_team_service_types(
  p_team_id          uuid,
  p_service_type_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wanted uuid[] := coalesce(p_service_type_ids, '{}');
begin
  delete from public.service_type_teams
  where team_id = p_team_id
    and service_type_id <> all (v_wanted);

  insert into public.service_type_teams (service_type_id, team_id, sort_order)
  select wanted.id, p_team_id,
         coalesce((select max(stt.sort_order) + 1
                   from public.service_type_teams stt
                   where stt.service_type_id = wanted.id), 0)
  from (select distinct unnest(v_wanted) as id) as wanted
  on conflict (service_type_id, team_id) do nothing;
end;
$$;

-- The teams a service type requires, in display order (array position).
create or replace function public.replace_service_type_teams(
  p_service_type_id uuid,
  p_team_ids        uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wanted uuid[] := coalesce(p_team_ids, '{}');
begin
  delete from public.service_type_teams
  where service_type_id = p_service_type_id
    and team_id <> all (v_wanted);

  insert into public.service_type_teams (service_type_id, team_id, sort_order)
  select p_service_type_id, wanted.team_id, (min(wanted.ord) - 1)::integer
  from unnest(v_wanted) with ordinality as wanted (team_id, ord)
  group by wanted.team_id
  on conflict (service_type_id, team_id)
    do update set sort_order = excluded.sort_order
    where service_type_teams.sort_order is distinct from excluded.sort_order;
end;
$$;

-- Create (no p_rule_id) or update a conditional rule and replace its effects.
-- p_rule carries conditional_rules columns, p_effects an array of
-- conditional_rule_effects rows (rule_id is filled in here). Returns the id.
create or replace function public.save_conditional_rule(
  p_rule    jsonb,
  p_effects jsonb,
  p_rule_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule public.conditional_rules :=
    jsonb_populate_record(null::public.conditional_rules, p_rule);
  v_id uuid := p_rule_id;
begin
  if v_id is null then
    insert into public.conditional_rules (
      name, service_type_id, trigger_position_id, trigger_attribute,
      trigger_value, trigger_person_id, strength, enabled
    )
    values (
      v_rule.name, v_rule.service_type_id, v_rule.trigger_position_id,
      v_rule.trigger_attribute, v_rule.trigger_value, v_rule.trigger_person_id,
      coalesce(v_rule.strength, 'hard'), coalesce(v_rule.enabled, true)
    )
    returning id into v_id;
  else
    update public.conditional_rules
    set name                = v_rule.name,
        service_type_id     = v_rule.service_type_id,
        trigger_position_id = v_rule.trigger_position_id,
        trigger_attribute   = v_rule.trigger_attribute,
        trigger_value       = v_rule.trigger_value,
        trigger_person_id   = v_rule.trigger_person_id,
        strength            = coalesce(v_rule.strength, 'hard'),
        enabled             = coalesce(v_rule.enabled, true)
    where id = v_id;
    -- Gone, or RLS hid it from this caller.
    if not found then
      raise exception 'That rule no longer exists';
    end if;

    delete from public.conditional_rule_effects where rule_id = v_id;
  end if;

  insert into public.conditional_rule_effects (
    rule_id, target_position_id, effect_kind, min_count, required_person_id
  )
  select v_id, e.target_position_id, e.effect_kind, e.min_count, e.required_person_id
  from jsonb_populate_recordset(
    null::public.conditional_rule_effects, coalesce(p_effects, '[]'::jsonb)
  ) as e;

  return v_id;
end;
$$;

revoke all on function public.replace_team_service_types(uuid, uuid[]) from public, anon;
revoke all on function public.replace_service_type_teams(uuid, uuid[]) from public, anon;
revoke all on function public.save_conditional_rule(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.replace_team_service_types(uuid, uuid[])
  to authenticated, service_role;
grant execute on function public.replace_service_type_teams(uuid, uuid[])
  to authenticated, service_role;
grant execute on function public.save_conditional_rule(jsonb, jsonb, uuid)
  to authenticated, service_role;
