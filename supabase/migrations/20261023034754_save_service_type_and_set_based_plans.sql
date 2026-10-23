-- Migration 0068 — A service type and its required teams save together, and
-- create_plans copies its source in set-based statements. Found by
-- `/code-review`. Re-runnable.
--
-- Creating a service type was an insert followed by replace_service_type_teams
-- (0065) as a second request: when the second failed, the type was left with
-- no required teams — the dialog could finish it, but not once it was closed.
-- save_service_type does the type and its teams in one transaction, for a new
-- type and an edit alike.
--
-- create_plans (0067) looped per date, re-reading the source for each week,
-- and kept two copies of the copy code (template, plan). It now inserts every
-- date's plan in one statement and copies items, times and minimums from one
-- source query each, so a new plan_items column is added in one place here.
-- Same signature and behaviour; security invoker as before.

-- Create (no p_id) or update a service type and set its required teams, in
-- display order. Returns its id.
create or replace function public.save_service_type(
  p_values   jsonb,
  p_team_ids uuid[],
  p_id       uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_type public.service_types :=
    jsonb_populate_record(null::public.service_types, p_values);
  v_id uuid := p_id;
begin
  if v_id is null then
    insert into public.service_types (
      name, default_start_time, end_time, frequency, days_of_week
    )
    values (
      v_type.name, v_type.default_start_time, v_type.end_time, v_type.frequency,
      coalesce(v_type.days_of_week, '{}')
    )
    returning id into v_id;
  else
    update public.service_types
    set name               = v_type.name,
        default_start_time = v_type.default_start_time,
        end_time           = v_type.end_time,
        frequency          = v_type.frequency,
        days_of_week       = coalesce(v_type.days_of_week, '{}')
    where id = v_id;
    -- Gone, or RLS hid it from this caller.
    if not found then
      raise exception 'That service type no longer exists';
    end if;
  end if;

  perform public.replace_service_type_teams(v_id, p_team_ids);
  return v_id;
end;
$$;

create or replace function public.create_plans(
  p_plan          jsonb,
  p_dates         date[],
  p_source_kind   text default null,
  p_source_id     uuid default null,
  p_inherit_start boolean default false
)
returns setof public.plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.plans := jsonb_populate_record(null::public.plans, p_plan);
  v_start time := v_plan.start_time;
  v_source_start time;
begin
  if (p_source_kind is null) <> (p_source_id is null)
     or p_source_kind not in ('template', 'plan') then
    raise exception 'Copy from a template or a plan, with its id';
  end if;
  if coalesce(cardinality(p_dates), 0) = 0 then
    raise exception 'Choose at least one date';
  end if;

  if p_source_kind = 'template' then
    select start_time into v_source_start from public.plan_templates where id = p_source_id;
    if not found then
      raise exception 'That template no longer exists';
    end if;
  elsif p_source_kind = 'plan' then
    select start_time into v_source_start from public.plans where id = p_source_id;
    if not found then
      raise exception 'That plan no longer exists';
    end if;
  end if;
  if p_inherit_start and p_source_kind is not null then
    v_start := v_source_start;
  end if;

  -- One statement: the sub-inserts all run, whether or not the final select
  -- reads them, and see the source as it was before any of them.
  return query
  with new_plans as (
    insert into public.plans (service_type_id, date, title, start_time)
    select v_plan.service_type_id, d, v_plan.title, v_start
    from (select distinct unnest(p_dates) as d) as dates
    returning *
  ),
  source_items as (
    select sort_order, kind, title, arrangement_id, key_override, bpm_override,
           reference_url, sequence, length_seconds, description
    from public.plan_template_items
    where p_source_kind = 'template' and template_id = p_source_id
    union all
    select sort_order, kind, title, arrangement_id, key_override, bpm_override,
           reference_url, sequence, length_seconds, description
    from public.plan_items
    where p_source_kind = 'plan' and plan_id = p_source_id
  ),
  copied_items as (
    insert into public.plan_items (
      plan_id, sort_order, kind, title, arrangement_id, key_override,
      bpm_override, reference_url, sequence, length_seconds, description
    )
    select np.id, s.sort_order, s.kind, s.title, s.arrangement_id, s.key_override,
           s.bpm_override, s.reference_url, s.sequence, s.length_seconds, s.description
    from new_plans np cross join source_items s
  ),
  source_times as (
    select label, start_time, sort_order
    from public.plan_template_times
    where p_source_kind = 'template' and template_id = p_source_id
    union all
    select label, start_time, sort_order
    from public.plan_times
    where p_source_kind = 'plan' and plan_id = p_source_id
  ),
  copied_times as (
    insert into public.plan_times (plan_id, label, start_time, sort_order)
    select np.id, s.label, s.start_time, s.sort_order
    from new_plans np cross join source_times s
  ),
  source_min_counts as (
    select position_id, min_count
    from public.plan_template_position_min_counts
    where p_source_kind = 'template' and template_id = p_source_id
    union all
    select position_id, min_count
    from public.plan_position_min_counts
    where p_source_kind = 'plan' and plan_id = p_source_id
  ),
  copied_min_counts as (
    insert into public.plan_position_min_counts (plan_id, position_id, min_count)
    select np.id, s.position_id, s.min_count
    from new_plans np cross join source_min_counts s
  )
  select * from new_plans order by date;
end;
$$;

revoke all on function public.save_service_type(jsonb, uuid[], uuid) from public, anon;
grant execute on function public.save_service_type(jsonb, uuid[], uuid)
  to authenticated, service_role;
