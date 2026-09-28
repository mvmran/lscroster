-- Migration 0048 — Merge Team Leader + Team Viewer into one graded grant.
-- See docs/DESIGN-team-access-merge.md. team_leaders + team_viewers become a
-- single team_grants(team_id, person_id, access) with three ordered levels:
--   viewer    — read the team's members, positions and its plans/roster.
--   scheduler — the above, plus assign members to plans, set per-plan targets,
--               mute rule warnings, and email them; may NOT change membership.
--   manager   — the above, plus manage membership and positions (old Team Leader).
-- Admins and coordinators hold manager on every team implicitly.
-- Decisions taken: schedulers see contact details (D1); schedulers set per-plan
-- min counts (D2); the roster digest still reaches every grant level (D3).

-- 1. Enum + table ------------------------------------------------------------
create type public.team_access as enum ('viewer', 'scheduler', 'manager');

create table public.team_grants (
  team_id   uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  access    public.team_access not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, person_id)
);

create index team_grants_team_idx on public.team_grants (team_id);
create index team_grants_person_idx on public.team_grants (person_id);

create trigger team_grants_set_updated_at
  before update on public.team_grants
  for each row execute function public.set_updated_at();

-- 2. Data migration — viewers first, then managers override on conflict -------
insert into public.team_grants (team_id, person_id, access)
  select team_id, person_id, 'viewer'::public.team_access from public.team_viewers
  on conflict (team_id, person_id) do nothing;

insert into public.team_grants (team_id, person_id, access)
  select team_id, person_id, 'manager'::public.team_access from public.team_leaders
  on conflict (team_id, person_id) do update set access = 'manager';

-- 3. Helpers -----------------------------------------------------------------
-- security definer so policies consult team_grants without RLS recursion.

-- manager of this team (old leads_team).
create or replace function public.is_team_manager(target_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_grants
    where team_id = target_team_id
      and person_id = public.current_person_id()
      and access = 'manager'
  );
$$;

-- may manage the team's structure: admin/coordinator, or its manager.
create or replace function public.can_manage_team(target_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_coordinator() or public.is_team_manager(target_team_id);
$$;

-- may schedule the team (assign to plans, email, mute rules, set targets):
-- admin/coordinator, or a scheduler/manager of the team.
create or replace function public.can_schedule_team(target_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_coordinator() or exists (
    select 1 from public.team_grants
    where team_id = target_team_id
      and person_id = public.current_person_id()
      and access in ('scheduler', 'manager')
  );
$$;

-- holds any grant on this team (viewer+) — read visibility.
create or replace function public.views_team(target_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_grants
    where team_id = target_team_id
      and person_id = public.current_person_id()
  );
$$;

-- holds any grant on a team that has an assignment on the plan (read tier).
create or replace function public.is_viewer_of_plan(target_plan_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.plan_assignments pa
    join public.team_grants tg on tg.team_id = pa.team_id
    where pa.plan_id = target_plan_id
      and tg.person_id = public.current_person_id()
  );
$$;

-- scheduler/manager of a team that serves this plan's service type — the
-- rostering visibility that lets them open and roster the plan before any
-- assignment exists (old leads_team_on_plan, widened to scheduler+).
create or replace function public.schedules_team_on_plan(target_plan_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.team_grants tg
    join public.plans p on p.id = target_plan_id
    where tg.person_id = public.current_person_id()
      and tg.access in ('scheduler', 'manager')
      and (
        not exists (
          select 1 from public.service_type_teams stt where stt.team_id = tg.team_id
        )
        or exists (
          select 1 from public.service_type_teams stt
          where stt.team_id = tg.team_id and stt.service_type_id = p.service_type_id
        )
      )
  );
$$;

-- holds scheduler+ on any team (feeds the scheduling-prefs read policies).
create or replace function public.schedules_any_team()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_grants
    where person_id = public.current_person_id()
      and access in ('scheduler', 'manager')
  );
$$;

-- Contact-detail visibility now extends to schedulers as well as managers (D1).
create or replace function public.can_view_contact(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin_or_coordinator()
    or target = public.current_person_id()
    or public.manages_person(target)
    or exists (
      select 1
      from public.team_members tm
      join public.team_grants tg on tg.team_id = tm.team_id
      where tm.person_id = target
        and tg.person_id = public.current_person_id()
        and tg.access in ('scheduler', 'manager')
    );
$$;

-- 4. Re-point policies off the dropped helpers -------------------------------
-- plan_assignments read: views_team now covers every grant level, so the old
-- explicit leads_team term is redundant.
drop policy "View own assignments or those on visible plans" on public.plan_assignments;
create policy "View own assignments or those on visible plans"
  on public.plan_assignments for select to authenticated
  using (
    public.is_admin_or_coordinator()
    or person_id = public.current_person_id()
    or public.views_team(team_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_assignments.plan_id and p.status = 'published'
    )
  );

-- plan_assignments write: scheduling, not membership management.
drop policy "Team leaders manage assignments" on public.plan_assignments;
create policy "Schedulers manage assignments"
  on public.plan_assignments for all to authenticated
  using (public.can_schedule_team(team_id))
  with check (public.can_schedule_team(team_id));

-- per-plan min counts: a scheduling target (D2).
drop policy "Team leaders manage plan position min counts" on public.plan_position_min_counts;
create policy "Schedulers manage plan position min counts"
  on public.plan_position_min_counts for all to authenticated
  using (exists (
    select 1 from public.positions p
    where p.id = plan_position_min_counts.position_id and public.can_schedule_team(p.team_id)
  ))
  with check (exists (
    select 1 from public.positions p
    where p.id = plan_position_min_counts.position_id and public.can_schedule_team(p.team_id)
  ));

-- rule mutes: a scheduling action.
drop policy "Schedulers manage plan rule mutes" on public.plan_rule_mutes;
create policy "Schedulers manage plan rule mutes"
  on public.plan_rule_mutes for all to authenticated
  using (public.is_admin_or_coordinator() or public.schedules_team_on_plan(plan_id))
  with check (public.is_admin_or_coordinator() or public.schedules_team_on_plan(plan_id));

-- plan + children read: leads_team_on_plan -> schedules_team_on_plan.
drop policy "View published or own assigned plans" on public.plans;
create policy "View published or own assigned plans"
  on public.plans for select to authenticated
  using (
    status = 'published'
    or public.can_see_all_plans()
    or public.is_assigned_to_plan(id)
    or public.is_viewer_of_plan(id)
    or public.schedules_team_on_plan(id)
  );

drop policy "View items of visible plans" on public.plan_items;
create policy "View items of visible plans"
  on public.plan_items for select to authenticated
  using (
    public.can_see_all_plans()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
    or public.schedules_team_on_plan(plan_id)
    or exists (select 1 from public.plans p where p.id = plan_items.plan_id and p.status = 'published')
  );

drop policy "View times of visible plans" on public.plan_times;
create policy "View times of visible plans"
  on public.plan_times for select to authenticated
  using (
    public.can_see_all_plans()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
    or public.schedules_team_on_plan(plan_id)
    or exists (select 1 from public.plans p where p.id = plan_times.plan_id and p.status = 'published')
  );

drop policy "View attachments of visible plans" on public.plan_attachments;
create policy "View attachments of visible plans"
  on public.plan_attachments for select to authenticated
  using (
    public.can_see_all_plans()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
    or public.schedules_team_on_plan(plan_id)
    or exists (select 1 from public.plans p where p.id = plan_attachments.plan_id and p.status = 'published')
  );

-- scheduling-prefs reads: leads_any_team -> schedules_any_team.
drop policy "Schedulers view scheduling prefs" on public.person_scheduling_prefs;
create policy "Schedulers view scheduling prefs"
  on public.person_scheduling_prefs for select to authenticated
  using (public.is_admin_or_coordinator() or public.schedules_any_team());

drop policy "Schedulers view recurring unavailability" on public.person_recurring_unavailability;
create policy "Schedulers view recurring unavailability"
  on public.person_recurring_unavailability for select to authenticated
  using (public.is_admin_or_coordinator() or public.schedules_any_team());

drop policy "Schedulers view pairings" on public.person_pairings;
create policy "Schedulers view pairings"
  on public.person_pairings for select to authenticated
  using (public.is_admin_or_coordinator() or public.schedules_any_team());

-- 5. Drop the now-unused helpers ---------------------------------------------
drop function public.leads_team_on_plan(uuid);
drop function public.leads_any_team();
drop function public.leads_team(uuid);

-- 6. Audit: replace the two per-table triggers with one on team_grants -------
create or replace function public.audit_team_grants()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_person  uuid;
  v_team_id uuid;
  v_name    text;
  v_team    text;
  v_action  text;
  v_detail  text;
begin
  if tg_op = 'DELETE' then
    v_person := old.person_id; v_team_id := old.team_id;
  else
    v_person := new.person_id; v_team_id := new.team_id;
  end if;

  select nullif(trim(p.first_name || ' ' || p.last_name), ''), t.name
    into v_name, v_team
    from public.people p
    left join public.teams t on t.id = v_team_id
    where p.id = v_person;

  if tg_op = 'INSERT' then
    v_action := 'team.grant_add';
    v_detail := coalesce(v_name, 'Person') || ' granted ' || new.access
                || ' of team ' || coalesce(v_team, '(deleted)');
  elsif tg_op = 'UPDATE' then
    v_action := 'team.grant_change';
    v_detail := coalesce(v_name, 'Person') || ' changed to ' || new.access
                || ' of team ' || coalesce(v_team, '(deleted)');
  else
    v_action := 'team.grant_remove';
    v_detail := coalesce(v_name, 'Person') || ' removed as ' || old.access
                || ' of team ' || coalesce(v_team, '(deleted)');
  end if;

  perform public.audit_record(
    v_action, v_person, v_name, v_detail,
    jsonb_build_object('team_id', v_team_id, 'team', v_team,
      'access', case when tg_op = 'DELETE' then old.access else new.access end));

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- 7. Drop the old tables (their triggers/indexes cascade) --------------------
drop trigger audit_team_leaders_aid on public.team_leaders;
drop trigger audit_team_viewers_aid on public.team_viewers;
drop table public.team_leaders;
drop table public.team_viewers;
drop function public.audit_team_grant();

create trigger audit_team_grants_aid
  after insert or update or delete on public.team_grants
  for each row execute function public.audit_team_grants();

-- 8. RLS on team_grants: church-wide read; governance appoints ---------------
alter table public.team_grants enable row level security;

create policy "Authenticated can view team grants"
  on public.team_grants for select to authenticated using (true);

create policy "Governance manages team grants"
  on public.team_grants for all to authenticated
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());
