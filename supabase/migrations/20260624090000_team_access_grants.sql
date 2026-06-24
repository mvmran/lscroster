-- Migration 0023 — Per-team access grants: Team Leaders & Team Viewers
-- Until now management was global: any admin/leader could manage every team
-- (is_admin_or_leader). This adds two per-team grants, independent of team
-- membership and of the global role (a grant can go to any person):
--   * team_leaders — the grantee manages that team's positions, members and
--     plan assignments (content tier).
--   * team_viewers — the grantee gets a read-only view of that team's roster
--     on plans (incl. drafts), plus the plan's order of service (read tier).
-- Governance (create teams, appoint leaders/viewers on any team) stays with
-- admins + global leaders (is_admin_or_leader). The global `leader` role's
-- *content* powers are now scoped: a leader manages a team's content only if
-- they're also that team's Team Leader.

-- join tables ----------------------------------------------------------------

create table public.team_leaders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, person_id)
);

create index team_leaders_team_idx on public.team_leaders (team_id);
create index team_leaders_person_idx on public.team_leaders (person_id);

create trigger team_leaders_set_updated_at
  before update on public.team_leaders
  for each row execute function public.set_updated_at();

create table public.team_viewers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, person_id)
);

create index team_viewers_team_idx on public.team_viewers (team_id);
create index team_viewers_person_idx on public.team_viewers (person_id);

create trigger team_viewers_set_updated_at
  before update on public.team_viewers
  for each row execute function public.set_updated_at();

-- helpers --------------------------------------------------------------------
-- security definer so policies can consult these join tables without RLS
-- recursion (mirrors is_admin / is_assigned_to_plan).

create or replace function public.leads_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_leaders
    where team_id = target_team_id
      and person_id = public.current_person_id()
  );
$$;

-- True when the caller may manage a team's content: an admin, or a Team Leader
-- of that specific team.
create or replace function public.can_manage_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.leads_team(target_team_id);
$$;

create or replace function public.views_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_viewers
    where team_id = target_team_id
      and person_id = public.current_person_id()
  );
$$;

-- The team_id a membership row belongs to — lets the team_member_positions
-- policy resolve a team without an RLS subquery.
create or replace function public.team_of_member(target_member_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.team_members where id = target_member_id;
$$;

-- True when the caller is a Team Viewer of a team that has an assignment on the
-- plan — grants read-only visibility of the plan + its order of service.
-- Mirrors is_assigned_to_plan so it can feed the same select policies.
create or replace function public.is_viewer_of_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_assignments pa
    join public.team_viewers tv on tv.team_id = pa.team_id
    where pa.plan_id = target_plan_id
      and tv.person_id = public.current_person_id()
  );
$$;

-- RLS on the new tables ------------------------------------------------------
-- Visible to the whole church; appointed by governance (admins + global
-- leaders) on any team — Team Leaders themselves cannot appoint.

alter table public.team_leaders enable row level security;
alter table public.team_viewers enable row level security;

create policy "Authenticated can view team leaders"
  on public.team_leaders for select
  to authenticated
  using (true);

create policy "Governance manages team leaders"
  on public.team_leaders for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "Authenticated can view team viewers"
  on public.team_viewers for select
  to authenticated
  using (true);

create policy "Governance manages team viewers"
  on public.team_viewers for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- Re-point content-tier write policies from blanket is_admin_or_leader() to
-- per-team can_manage_team(). Teams-table policy is left as-is (governance).

drop policy "Leaders manage positions" on public.positions;
create policy "Team leaders manage positions"
  on public.positions for all
  to authenticated
  using (public.can_manage_team(team_id))
  with check (public.can_manage_team(team_id));

drop policy "Leaders manage team members" on public.team_members;
create policy "Team leaders manage team members"
  on public.team_members for all
  to authenticated
  using (public.can_manage_team(team_id))
  with check (public.can_manage_team(team_id));

drop policy "Leaders manage team member positions" on public.team_member_positions;
create policy "Team leaders manage team member positions"
  on public.team_member_positions for all
  to authenticated
  using (public.can_manage_team(public.team_of_member(team_member_id)))
  with check (public.can_manage_team(public.team_of_member(team_member_id)));

drop policy "Leaders manage assignments" on public.plan_assignments;
create policy "Team leaders manage assignments"
  on public.plan_assignments for all
  to authenticated
  using (public.can_manage_team(team_id))
  with check (public.can_manage_team(team_id));

-- Extend read policies so Team Viewers see the plans + order of service for the
-- teams they view (any plan status), and their viewed teams' rosters.

drop policy "View published or own assigned plans" on public.plans;
create policy "View published or own assigned plans"
  on public.plans for select
  to authenticated
  using (
    status = 'published'
    or public.is_admin_or_leader()
    or public.is_assigned_to_plan(id)
    or public.is_viewer_of_plan(id)
  );

drop policy "View items of visible plans" on public.plan_items;
create policy "View items of visible plans"
  on public.plan_items for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id)
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
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

-- A Team Viewer can read the roster rows of teams they view (any plan status).
drop policy "View own assignments or those on visible plans" on public.plan_assignments;
create policy "View own assignments or those on visible plans"
  on public.plan_assignments for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or person_id = public.current_person_id()
    or public.views_team(team_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );
