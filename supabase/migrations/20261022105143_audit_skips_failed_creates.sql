-- Migration 0063 — The delete audit (0059) skips a create that failed, and
-- cascaded rows skip the date lookup. Found by `/code-review`. Re-runnable.

-- 1. A failed create isn't a delete ---------------------------------------------
-- Creating a plan inserts the plan, then its items, times and minimums copied
-- from a template or plan; creating an arrangement inserts it, then links it to
-- its song. Either second step can fail, and the app then deletes what it just
-- made. 0059 logged that as a real delete ("Deleted the Sun … plan (draft) with
-- 0 assignments…", "Deleted arrangement Song — …") of something nobody saw.
--
-- An arrangement linked to no song can't be seen or used, so it is never
-- logged. A plan is skipped when it is a draft made in the last two minutes
-- with no one on it and no files: the app's undo comes seconds after the
-- insert, and a plan like that loses nothing (its items are still in the
-- template or plan they came from). Deleting a draft by hand that soon is not
-- logged either.
--
-- created_at now keeps its value on update, so no plan can be made to look
-- new to slip past the log.
create or replace function public.keep_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists plans_keep_created_at on public.plans;
create trigger plans_keep_created_at
  before update on public.plans
  for each row execute function public.keep_created_at();

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
  select count(*), count(*) filter (where status = 'confirmed')
    into v_assign, v_confirmed
    from public.plan_assignments where plan_id = old.id;
  select count(*) into v_files from public.plan_attachments where plan_id = old.id;
  if old.status = 'draft' and old.created_at > now() - interval '2 minutes'
     and v_assign = 0 and v_files = 0 then
    return old;
  end if;
  select name into v_type from public.service_types where id = old.service_type_id;
  v_label := public.audit_plan_label(old.date, v_type);
  select count(*) into v_items from public.plan_items where plan_id = old.id;
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
  if v_songs is null then return old; end if;
  v_label := v_songs || ' — ' || old.name;
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

-- 2. Today is looked up after the cascade check ---------------------------------
-- These read the church's date in their declare block, before the
-- pg_trigger_depth() check — so each position going with its team, say, paid
-- for a church_settings read and a timezone conversion it then threw away.
create or replace function public.audit_service_type_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date;
  v_plans    bigint;
  v_past     bigint;
  v_assign   bigint;
  v_files    bigint;
  v_templ    bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  v_today := public.audit_church_today();
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

create or replace function public.audit_team_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date;
  v_positions bigint;
  v_members   bigint;
  v_assign    bigint;
  v_past      bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  v_today := public.audit_church_today();
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

create or replace function public.audit_position_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date;
  v_team    text;
  v_label   text;
  v_assign  bigint;
  v_past    bigint;
  v_members bigint;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  v_today := public.audit_church_today();
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
