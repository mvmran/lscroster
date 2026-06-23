-- Migration 0022 — Managers see plans their managed people are on (issue #89 follow-up)
-- A managing member (e.g. a parent looking after a child's account) could read the
-- managed person's plan_assignments but NOT the plan behind them: is_assigned_to_plan()
-- only matched the signed-in person, so a *draft* plan a managed person is rostered onto
-- stayed invisible to the manager — and the manager's My Schedule / Home silently dropped
-- those rows. Widen the helper to also match anyone the caller manages, exactly mirroring
-- how a member sees their own draft plans. It already feeds the plans / plan_items /
-- plan_times / plan_attachments select policies, so this also surfaces the order of service.
create or replace function public.is_assigned_to_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plan_assignments
    where plan_id = target_plan_id
      and (
        person_id = public.current_person_id()
        or public.manages_person(person_id)
      )
  );
$$;
