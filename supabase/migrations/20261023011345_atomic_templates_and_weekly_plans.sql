-- Migration 0067 — Saving a plan template and creating plans (one or a run of
-- weekly ones) each happen in one transaction. Found by `/code-review`.
-- Re-runnable.
--
-- Updating a template was rename → delete items → insert items → replace
-- times → replace minimums, each a separate request: a failure partway left
-- the template renamed with no order of service, and the old one was gone.
-- Creating weekly plans ran one plan at a time (four source reads, then an
-- insert per table, per date); a failure partway reported "Could not create
-- plan" with the earlier weeks already made, so a retry duplicated them.
--
-- Security invoker (the default, spelled out): every table's own RLS still
-- decides — templates and plans need create_delete_plans, a plan's items and
-- times edit_order_of_service (which create_delete_plans implies).

-- Create (no p_template_id) or overwrite a template: its name and start
-- (plus the service type, on create), and wholesale its items, times and
-- per-position minimums. Returns the template's id.
create or replace function public.save_plan_template(
  p_template    jsonb,
  p_items       jsonb,
  p_times       jsonb,
  p_min_counts  jsonb,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.plan_templates :=
    jsonb_populate_record(null::public.plan_templates, p_template);
  v_id uuid := p_template_id;
begin
  if v_id is null then
    insert into public.plan_templates (service_type_id, name, start_time)
    values (v_template.service_type_id, v_template.name, v_template.start_time)
    returning id into v_id;
  else
    update public.plan_templates
    set name = v_template.name,
        start_time = v_template.start_time
    where id = v_id;
    -- Gone, or RLS hid it from this caller.
    if not found then
      raise exception 'That template no longer exists';
    end if;

    delete from public.plan_template_items where template_id = v_id;
    delete from public.plan_template_times where template_id = v_id;
    delete from public.plan_template_position_min_counts where template_id = v_id;
  end if;

  insert into public.plan_template_items (
    template_id, sort_order, kind, title, arrangement_id, key_override,
    bpm_override, reference_url, sequence, length_seconds, description
  )
  select v_id, i.sort_order, i.kind, i.title, i.arrangement_id, i.key_override,
         i.bpm_override, i.reference_url, i.sequence, i.length_seconds, i.description
  from jsonb_populate_recordset(
    null::public.plan_template_items, coalesce(p_items, '[]'::jsonb)
  ) as i;

  insert into public.plan_template_times (template_id, label, start_time, sort_order)
  select v_id, t.label, t.start_time, t.sort_order
  from jsonb_populate_recordset(
    null::public.plan_template_times, coalesce(p_times, '[]'::jsonb)
  ) as t;

  insert into public.plan_template_position_min_counts (template_id, position_id, min_count)
  select v_id, m.position_id, m.min_count
  from jsonb_populate_recordset(
    null::public.plan_template_position_min_counts, coalesce(p_min_counts, '[]'::jsonb)
  ) as m;

  return v_id;
end;
$$;

-- One plan per date (a single plan, or a weekly run), each optionally copied
-- from a template or a plan: its order of service, times and per-position
-- minimums. p_plan carries service_type_id, title and start_time. With
-- p_inherit_start the source's start wins over p_plan's (a blank start on the
-- form); without it p_plan's start is used as given, null meaning the service
-- type's default. All the plans are made, or none. Returns them by date.
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
  v_date date;
  v_id uuid;
begin
  if (p_source_kind is null) <> (p_source_id is null)
     or p_source_kind not in ('template', 'plan') then
    raise exception 'Copy from a template or a plan, with its id';
  end if;
  if coalesce(cardinality(p_dates), 0) = 0 then
    raise exception 'Choose at least one date';
  end if;

  if p_source_kind = 'template' then
    perform 1 from public.plan_templates where id = p_source_id;
    if not found then
      raise exception 'That template no longer exists';
    end if;
    if p_inherit_start then
      select start_time into v_start from public.plan_templates where id = p_source_id;
    end if;
  elsif p_source_kind = 'plan' then
    perform 1 from public.plans where id = p_source_id;
    if not found then
      raise exception 'That plan no longer exists';
    end if;
    if p_inherit_start then
      select start_time into v_start from public.plans where id = p_source_id;
    end if;
  end if;

  foreach v_date in array (select array_agg(distinct d order by d) from unnest(p_dates) d) loop
    insert into public.plans (service_type_id, date, title, start_time)
    values (v_plan.service_type_id, v_date, v_plan.title, v_start)
    returning id into v_id;

    if p_source_kind = 'template' then
      insert into public.plan_items (
        plan_id, sort_order, kind, title, arrangement_id, key_override,
        bpm_override, reference_url, sequence, length_seconds, description
      )
      select v_id, sort_order, kind, title, arrangement_id, key_override,
             bpm_override, reference_url, sequence, length_seconds, description
      from public.plan_template_items
      where template_id = p_source_id;

      insert into public.plan_times (plan_id, label, start_time, sort_order)
      select v_id, label, start_time, sort_order
      from public.plan_template_times
      where template_id = p_source_id;

      insert into public.plan_position_min_counts (plan_id, position_id, min_count)
      select v_id, position_id, min_count
      from public.plan_template_position_min_counts
      where template_id = p_source_id;
    elsif p_source_kind = 'plan' then
      insert into public.plan_items (
        plan_id, sort_order, kind, title, arrangement_id, key_override,
        bpm_override, reference_url, sequence, length_seconds, description
      )
      select v_id, sort_order, kind, title, arrangement_id, key_override,
             bpm_override, reference_url, sequence, length_seconds, description
      from public.plan_items
      where plan_id = p_source_id;

      insert into public.plan_times (plan_id, label, start_time, sort_order)
      select v_id, label, start_time, sort_order
      from public.plan_times
      where plan_id = p_source_id;

      insert into public.plan_position_min_counts (plan_id, position_id, min_count)
      select v_id, position_id, min_count
      from public.plan_position_min_counts
      where plan_id = p_source_id;
    end if;

    return query select * from public.plans where id = v_id;
  end loop;
end;
$$;

revoke all on function public.save_plan_template(jsonb, jsonb, jsonb, jsonb, uuid)
  from public, anon;
revoke all on function public.create_plans(jsonb, date[], text, uuid, boolean)
  from public, anon;
grant execute on function public.save_plan_template(jsonb, jsonb, jsonb, jsonb, uuid)
  to authenticated, service_role;
grant execute on function public.create_plans(jsonb, date[], text, uuid, boolean)
  to authenticated, service_role;
