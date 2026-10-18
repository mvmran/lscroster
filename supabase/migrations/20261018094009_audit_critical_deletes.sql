-- Migration 0059 — Audit the deletes that lose plans, songs or history.
-- The audit log (0032) recorded people, team membership, team access and
-- permissions — nothing about the deletes that take the most with them. These
-- now leave an entry naming who did it and what went:
--
--   service_type.delete       a service type, with every plan under it
--   plan.delete               a plan, with its assignments, items, files
--   team.delete               a team, with its positions and assignments
--   position.delete           a position, with all its assignments
--   song.delete               a song, with its arrangements and lyrics
--   arrangement.delete        an arrangement, with its lyrics
--   plan.assignment_remove    someone taken off a plan already past
--   plan.item_remove          an item taken out of a plan already past
--
-- BEFORE DELETE row triggers, so the counts are taken while the rows that
-- cascade away still exist. A failed delete rolls its entry back with it.
--
-- One entry per delete a person made: a row removed *by* another delete's
-- cascade (a plan going with its service type, an assignment with its plan)
-- is in that delete's counts, so these triggers stand aside when
-- pg_trigger_depth() > 1 — the cascade runs one trigger level down. Removing
-- someone from (or an item out of) an upcoming plan is ordinary planning and is
-- not recorded: those two triggers look up the plan's date, by its primary
-- key, and stop there for any plan dated today or later in the church's
-- timezone. That keeps the busy scheduling path as cheap as it was.
--
-- Entries are written through audit_record (0032), so the actor comes from the
-- JWT, or from x-audit-actor for an Edge Function acting for someone. Plans,
-- songs and teams have no person to target: their entries carry the subject's
-- name in target_label (what the log's search and "Affected" column read) and
-- its ids and counts in metadata. Removing someone from a past plan targets
-- that person, so it shows under their name. No new table; RLS on audit_log
-- (admins read, nobody writes but these definer functions) is unchanged.
-- Re-runnable.

-- Helpers ---------------------------------------------------------------------

-- Today in the church's timezone: "past" is a plan dated before this.
create or replace function public.audit_church_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select timezone from public.church_settings limit 1), 'Australia/Sydney'))::date
$$;

-- "Sun 12 Oct 2026 · Sunday 10am" — how a plan is named in an entry.
create or replace function public.audit_plan_label(p_date date, p_service_type text)
returns text
language sql
immutable
as $$
  select to_char(p_date, 'Dy FMDD Mon YYYY') || coalesce(' · ' || p_service_type, '')
$$;

-- "1 plan", "3 plans".
create or replace function public.audit_count(p_count bigint, p_noun text)
returns text
language sql
immutable
as $$
  select p_count || ' ' || p_noun || case when p_count = 1 then '' else 's' end
$$;

-- service_types ---------------------------------------------------------------
create or replace function public.audit_service_type_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := public.audit_church_today();
  v_plans    bigint;
  v_past     bigint;
  v_assign   bigint;
  v_files    bigint;
  v_templ    bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  select count(*), count(*) filter (where date < v_today)
    into v_plans, v_past
    from public.plans where service_type_id = old.id;
  select count(*) into v_assign
    from public.plan_assignments a join public.plans p on p.id = a.plan_id
    where p.service_type_id = old.id;
  select count(*) into v_files
    from public.plan_attachments f join public.plans p on p.id = f.plan_id
    where p.service_type_id = old.id;
  select count(*) into v_templ from public.plan_templates where service_type_id = old.id;
  perform public.audit_record(
    'service_type.delete', null, old.name,
    'Deleted service type ' || old.name || ' with ' || public.audit_count(v_plans, 'plan')
      || ' (' || v_past || ' past), ' || public.audit_count(v_assign, 'assignment') || ', '
      || public.audit_count(v_files, 'attachment') || ' and '
      || public.audit_count(v_templ, 'template'),
    jsonb_build_object('service_type_id', old.id, 'plans', v_plans, 'past_plans', v_past,
      'assignments', v_assign, 'attachments', v_files, 'templates', v_templ));
  return old;
end;
$$;

drop trigger if exists audit_service_types_bd on public.service_types;
create trigger audit_service_types_bd
  before delete on public.service_types
  for each row execute function public.audit_service_type_delete();

-- plans -------------------------------------------------------------------------
create or replace function public.audit_plan_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type      text;
  v_label     text;
  v_assign    bigint;
  v_confirmed bigint;
  v_items     bigint;
  v_files     bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  select name into v_type from public.service_types where id = old.service_type_id;
  v_label := public.audit_plan_label(old.date, v_type);
  select count(*), count(*) filter (where status = 'confirmed')
    into v_assign, v_confirmed
    from public.plan_assignments where plan_id = old.id;
  select count(*) into v_items from public.plan_items where plan_id = old.id;
  select count(*) into v_files from public.plan_attachments where plan_id = old.id;
  perform public.audit_record(
    'plan.delete', null, v_label,
    'Deleted the ' || v_label || ' plan (' || old.status || ') with '
      || public.audit_count(v_assign, 'assignment') || ' (' || v_confirmed || ' confirmed), '
      || public.audit_count(v_items, 'item') || ' and '
      || public.audit_count(v_files, 'attachment'),
    jsonb_build_object('plan_id', old.id, 'date', old.date, 'service_type', v_type,
      'status', old.status, 'assignments', v_assign, 'confirmed', v_confirmed,
      'items', v_items, 'attachments', v_files));
  return old;
end;
$$;

drop trigger if exists audit_plans_bd on public.plans;
create trigger audit_plans_bd
  before delete on public.plans
  for each row execute function public.audit_plan_delete();

-- teams -------------------------------------------------------------------------
create or replace function public.audit_team_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := public.audit_church_today();
  v_positions bigint;
  v_members   bigint;
  v_assign    bigint;
  v_past      bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  select count(*) into v_positions from public.positions where team_id = old.id;
  select count(*) into v_members from public.team_members where team_id = old.id;
  select count(*), count(*) filter (where p.date < v_today)
    into v_assign, v_past
    from public.plan_assignments a join public.plans p on p.id = a.plan_id
    where a.team_id = old.id;
  perform public.audit_record(
    'team.delete', null, old.name,
    'Deleted team ' || old.name || ' with ' || public.audit_count(v_positions, 'position')
      || ', ' || public.audit_count(v_members, 'member') || ' and '
      || public.audit_count(v_assign, 'assignment') || ' (' || v_past || ' past)',
    jsonb_build_object('team_id', old.id, 'positions', v_positions, 'members', v_members,
      'assignments', v_assign, 'past_assignments', v_past));
  return old;
end;
$$;

drop trigger if exists audit_teams_bd on public.teams;
create trigger audit_teams_bd
  before delete on public.teams
  for each row execute function public.audit_team_delete();

-- positions ---------------------------------------------------------------------
create or replace function public.audit_position_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := public.audit_church_today();
  v_team    text;
  v_label   text;
  v_assign  bigint;
  v_past    bigint;
  v_members bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  select name into v_team from public.teams where id = old.team_id;
  v_label := old.name || coalesce(' (' || v_team || ')', '');
  select count(*), count(*) filter (where p.date < v_today)
    into v_assign, v_past
    from public.plan_assignments a join public.plans p on p.id = a.plan_id
    where a.position_id = old.id;
  select count(*) into v_members from public.team_member_positions where position_id = old.id;
  perform public.audit_record(
    'position.delete', null, v_label,
    'Deleted position ' || v_label || ' with ' || public.audit_count(v_assign, 'assignment')
      || ' (' || v_past || ' past) and ' || public.audit_count(v_members, 'member')
      || ' set up for it',
    jsonb_build_object('position_id', old.id, 'team_id', old.team_id, 'team', v_team,
      'assignments', v_assign, 'past_assignments', v_past, 'members', v_members));
  return old;
end;
$$;

drop trigger if exists audit_positions_bd on public.positions;
create trigger audit_positions_bd
  before delete on public.positions
  for each row execute function public.audit_position_delete();

-- songs -------------------------------------------------------------------------
-- Its arrangements go with it unless a medley shares them (0033's clean-up,
-- which runs inside this delete — so they are counted here, not logged again).
create or replace function public.audit_song_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arrangements bigint;
  v_plans        bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  with going as (
    select l.arrangement_id
      from public.song_arrangement_songs l
      where l.song_id = old.id
        and not exists (
          select 1 from public.song_arrangement_songs o
          where o.arrangement_id = l.arrangement_id and o.song_id <> old.id)
  )
  select (select count(*) from going),
         (select count(distinct i.plan_id) from public.plan_items i
           where i.arrangement_id in (select arrangement_id from going))
    into v_arrangements, v_plans;
  perform public.audit_record(
    'song.delete', null, old.title,
    'Deleted song ' || old.title || ' with ' || public.audit_count(v_arrangements, 'arrangement')
      || '; ' || public.audit_count(v_plans, 'plan')
      || case when v_plans = 1 then ' loses' else ' lose' end || ' its lyrics',
    jsonb_build_object('song_id', old.id, 'arrangements', v_arrangements,
      'plans_losing_lyrics', v_plans));
  return old;
end;
$$;

drop trigger if exists audit_songs_bd on public.songs;
create trigger audit_songs_bd
  before delete on public.songs
  for each row execute function public.audit_song_delete();

-- song_arrangements -------------------------------------------------------------
create or replace function public.audit_arrangement_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_songs    text;
  v_label    text;
  v_versions bigint;
  v_plans    bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  select string_agg(s.title, ' + ' order by l.sort_order)
    into v_songs
    from public.song_arrangement_songs l join public.songs s on s.id = l.song_id
    where l.arrangement_id = old.id;
  v_label := coalesce(v_songs, 'Song') || ' — ' || old.name;
  select count(*) into v_versions
    from public.song_arrangement_lyrics where arrangement_id = old.id;
  select count(distinct plan_id) into v_plans
    from public.plan_items where arrangement_id = old.id;
  perform public.audit_record(
    'arrangement.delete', null, v_label,
    'Deleted arrangement ' || v_label || ' with '
      || public.audit_count(v_versions, 'lyrics version') || '; '
      || public.audit_count(v_plans, 'plan')
      || case when v_plans = 1 then ' loses' else ' lose' end || ' its lyrics',
    jsonb_build_object('arrangement_id', old.id, 'songs', v_songs,
      'lyrics_versions', v_versions, 'plans_losing_lyrics', v_plans));
  return old;
end;
$$;

drop trigger if exists audit_song_arrangements_bd on public.song_arrangements;
create trigger audit_song_arrangements_bd
  before delete on public.song_arrangements
  for each row execute function public.audit_arrangement_delete();

-- plan_assignments: someone taken off a past plan -------------------------------
create or replace function public.audit_assignment_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date;
  v_type  text;
  v_name  text;
  v_pos   text;
  v_label text;
begin
  -- A plan, team, position or person delete: counted in its own entry.
  if pg_trigger_depth() > 1 then return old; end if;
  select p.date, st.name into v_date, v_type
    from public.plans p left join public.service_types st on st.id = p.service_type_id
    where p.id = old.plan_id;
  -- Upcoming plans are ordinary rostering: nothing to record.
  if v_date is null or v_date >= public.audit_church_today() then return old; end if;
  select nullif(trim(first_name || ' ' || last_name), '') into v_name
    from public.people where id = old.person_id;
  select name into v_pos from public.positions where id = old.position_id;
  v_label := public.audit_plan_label(v_date, v_type);
  perform public.audit_record(
    'plan.assignment_remove', old.person_id, v_name,
    coalesce(v_name, 'Someone') || ' (' || old.status || ') taken off '
      || coalesce(v_pos, 'a position') || ' on the past ' || v_label || ' plan',
    jsonb_build_object('plan_id', old.plan_id, 'date', v_date, 'service_type', v_type,
      'position', v_pos, 'status', old.status));
  return old;
end;
$$;

drop trigger if exists audit_plan_assignments_bd on public.plan_assignments;
create trigger audit_plan_assignments_bd
  before delete on public.plan_assignments
  for each row execute function public.audit_assignment_delete();

-- plan_items: an item taken out of a past plan ----------------------------------
create or replace function public.audit_plan_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date;
  v_type  text;
  v_label text;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  select p.date, st.name into v_date, v_type
    from public.plans p left join public.service_types st on st.id = p.service_type_id
    where p.id = old.plan_id;
  if v_date is null or v_date >= public.audit_church_today() then return old; end if;
  v_label := public.audit_plan_label(v_date, v_type);
  perform public.audit_record(
    'plan.item_remove', null, v_label,
    'Removed ' || old.kind || ' “' || old.title || '” from the past ' || v_label || ' plan',
    jsonb_build_object('plan_id', old.plan_id, 'date', v_date, 'service_type', v_type,
      'kind', old.kind, 'title', old.title));
  return old;
end;
$$;

drop trigger if exists audit_plan_items_bd on public.plan_items;
create trigger audit_plan_items_bd
  before delete on public.plan_items
  for each row execute function public.audit_plan_item_delete();
