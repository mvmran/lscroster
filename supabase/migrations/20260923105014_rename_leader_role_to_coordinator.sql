-- Rename the global `leader` role to `coordinator`.
--
-- "Leader" read backwards beside the per-team "Team Leader" grant (0023): the
-- global role cannot roster a team, while a member who is a Team Leader can.
-- What the global role actually holds is coordination across the church —
-- plans, songs, service types, teams, and who may lead or view them.
-- "Editor" was ruled out because it hides the role's governance and
-- personal-data reach; "Manager" because the app already has managing members
-- (managed accounts, 0021), and "Account managed by Jane" beside a Manager
-- badge would mean two unrelated things.
--
-- A rename in place, not a new value: every existing leader is a coordinator
-- the moment this runs, with nothing to backfill. The app bundle and Edge
-- Functions that ship with this migration compare against 'coordinator', so
-- the deploy order (db push, functions deploy, then the new bundle) leaves a
-- coordinator without their edit buttons for as long as the bundle takes to
-- go live, and no longer.
--
-- Guarded throughout so a second run is a no-op.

do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'leader'
  ) then
    alter type public.app_role rename value 'leader' to 'coordinator';
  end if;
end $$;

-- Policies and the people_directory view hold this function by oid, so they
-- follow the rename; function bodies that call it by name are redefined below.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin_or_leader'
  ) then
    alter function public.is_admin_or_leader() rename to is_admin_or_coordinator;
  end if;
end $$;

create or replace function public.is_admin_or_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_person_role() in ('admin', 'coordinator'), false);
$$;

create or replace function public.can_view_contact(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_or_coordinator()
    or target = public.current_person_id()
    or public.manages_person(target)
    or exists (
      select 1
      from public.team_members tm
      join public.team_leaders tl on tl.team_id = tm.team_id
      where tm.person_id = target
        and tl.person_id = public.current_person_id()
    );
$$;

create or replace function public.protect_assignment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), 'service_role') = 'service_role'
     or public.is_admin_or_coordinator() then
    return new;
  end if;
  if new.plan_id is distinct from old.plan_id
     or new.person_id is distinct from old.person_id
     or new.team_id is distinct from old.team_id
     or new.position_id is distinct from old.position_id
     or new.token_hash is distinct from old.token_hash
     or new.notified_at is distinct from old.notified_at
     or new.nudged_at is distinct from old.nudged_at
     or new.reminded_at is distinct from old.reminded_at then
    raise exception 'You can only change your response';
  end if;
  if new.status not in ('confirmed', 'declined') then
    raise exception 'You can only accept or decline';
  end if;
  return new;
end;
$$;

-- Policy names are labels only, but they are what a reader of `pg_policies`
-- (or the dashboard) sees, so they say "Coordinators" too. Policies about Team
-- Leaders keep their names — that grant is unchanged. The two on
-- storage.objects ("Leaders manage plan/song attachment files") keep theirs
-- because they must: renaming a policy needs ownership of the table, and
-- storage.objects belongs to Supabase's storage role, not the migration role.
-- They hold is_admin_or_coordinator() by oid, so they behave correctly regardless.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public', 'blockout_dates', 'View own blockouts or any as leader', 'View own blockouts or any as coordinator'),
      ('public', 'conditional_rule_effects', 'Leaders manage conditional rule effects', 'Coordinators manage conditional rule effects'),
      ('public', 'conditional_rules', 'Leaders manage conditional rules', 'Coordinators manage conditional rules'),
      ('public', 'person_email_prefs', 'Leaders manage email prefs', 'Coordinators manage email prefs'),
      ('public', 'person_email_prefs', 'View own or any email prefs as leader', 'View own or any email prefs as coordinator'),
      ('public', 'person_pairings', 'Leaders manage pairings', 'Coordinators manage pairings'),
      ('public', 'person_recurring_unavailability', 'Leaders manage recurring unavailability', 'Coordinators manage recurring unavailability'),
      ('public', 'person_scheduling_prefs', 'Leaders manage scheduling prefs', 'Coordinators manage scheduling prefs'),
      ('public', 'plan_attachments', 'Leaders manage plan attachments', 'Coordinators manage plan attachments'),
      ('public', 'plan_items', 'Leaders manage plan items', 'Coordinators manage plan items'),
      ('public', 'plan_rule_mutes', 'Leaders manage plan rule mutes', 'Coordinators manage plan rule mutes'),
      ('public', 'plan_template_items', 'Leaders manage plan template items', 'Coordinators manage plan template items'),
      ('public', 'plan_template_position_min_counts', 'Leaders manage plan template position min counts', 'Coordinators manage plan template position min counts'),
      ('public', 'plan_template_times', 'Leaders manage plan template times', 'Coordinators manage plan template times'),
      ('public', 'plan_templates', 'Leaders manage plan templates', 'Coordinators manage plan templates'),
      ('public', 'plan_times', 'Leaders manage plan times', 'Coordinators manage plan times'),
      ('public', 'plans', 'Leaders manage plans', 'Coordinators manage plans'),
      ('public', 'publish_overrides', 'Leaders record publish overrides', 'Coordinators record publish overrides'),
      ('public', 'service_type_teams', 'Leaders manage service type teams', 'Coordinators manage service type teams'),
      ('public', 'service_types', 'Leaders manage service types', 'Coordinators manage service types'),
      ('public', 'song_arrangement_lyrics', 'Leaders manage song arrangement lyrics', 'Coordinators manage song arrangement lyrics'),
      ('public', 'song_arrangement_songs', 'Leaders manage song arrangement links', 'Coordinators manage song arrangement links'),
      ('public', 'song_arrangements', 'Leaders manage song arrangements', 'Coordinators manage song arrangements'),
      ('public', 'song_attachments', 'Leaders manage song attachments', 'Coordinators manage song attachments'),
      ('public', 'songs', 'Leaders manage songs', 'Coordinators manage songs'),
      ('public', 'teams', 'Leaders manage teams', 'Coordinators manage teams')
    ) as v(schema_name, table_name, old_name, new_name)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = r.schema_name and tablename = r.table_name
        and policyname = r.old_name
    ) then
      execute format(
        'alter policy %I on %I.%I rename to %I',
        r.old_name, r.schema_name, r.table_name, r.new_name
      );
    elsif not exists (
      select 1 from pg_policies
      where schemaname = r.schema_name and tablename = r.table_name
        and policyname = r.new_name
    ) then
      raise exception 'policy "%" on %.% not found under either name',
        r.old_name, r.schema_name, r.table_name;
    end if;
  end loop;
end $$;
