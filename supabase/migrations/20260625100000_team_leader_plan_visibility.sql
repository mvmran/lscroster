-- Migration 0026 — Team Leaders see the plans they roster (issue #111)
-- A per-team Team Leader (migration 0023) manages a team's plan assignments via
-- can_manage_team(), but the plan read policies only let them SEE a plan when
-- it's published, they're assigned to it, or they're a Team Viewer with an
-- existing assignment on it. So a Team Leader who is a plain `member` couldn't
-- open a *draft* plan that has no roster yet — exactly the plan they need to
-- schedule. Widen plan visibility to "leads a team that serves this plan", so a
-- Team Leader sees every plan where their team is present (any status), and the
-- roster rows of the teams they lead.
--
-- "A team serves a plan" mirrors teamServesType() in the client: a team with no
-- service_type_teams rows serves every service type; otherwise it serves only
-- the linked ones. Security definer so the policy can consult the join tables
-- without RLS recursion (matches leads_team / is_viewer_of_plan from 0023).

create or replace function public.leads_team_on_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_leaders tl
    join public.plans p on p.id = target_plan_id
    where tl.person_id = public.current_person_id()
      and (
        -- team serves all service types (no explicit links)…
        not exists (
          select 1 from public.service_type_teams stt
          where stt.team_id = tl.team_id
        )
        -- …or it's explicitly linked to this plan's service type.
        or exists (
          select 1 from public.service_type_teams stt
          where stt.team_id = tl.team_id
            and stt.service_type_id = p.service_type_id
        )
      )
  );
$$;

-- Extend the plan + plan-children read policies with leads_team_on_plan(), so a
-- Team Leader can open and roster their teams' plans (incl. drafts).

drop policy "View published or own assigned plans" on public.plans;
create policy "View published or own assigned plans"
  on public.plans for select
  to authenticated
  using (
    status = 'published'
    or public.is_admin_or_leader()
    or public.is_assigned_to_plan(id)
    or public.is_viewer_of_plan(id)
    or public.leads_team_on_plan(id)
  );

drop policy "View items of visible plans" on public.plan_items;
create policy "View items of visible plans"
  on public.plan_items for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
    or public.leads_team_on_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

drop policy "View times of visible plans" on public.plan_times;
create policy "View times of visible plans"
  on public.plan_times for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
    or public.leads_team_on_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

drop policy "View attachments of visible plans" on public.plan_attachments;
create policy "View attachments of visible plans"
  on public.plan_attachments for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
    or public.leads_team_on_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

-- A Team Leader reads the roster rows of the teams they lead (any plan status),
-- so existing assignments show when they open a draft plan to schedule.
drop policy "View own assignments or those on visible plans" on public.plan_assignments;
create policy "View own assignments or those on visible plans"
  on public.plan_assignments for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or person_id = public.current_person_id()
    or public.views_team(team_id)
    or public.leads_team(team_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );
