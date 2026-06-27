-- Migration 0032 — Auditing (issue #116)
-- A lightweight, append-only audit trail for high-value people/team events.
-- Design goals: low write overhead and impossible to bypass. We use AFTER-row
-- triggers on a handful of *low-frequency* tables only (people, team_members,
-- team_leaders, team_viewers) — never on hot paths like plan_assignments — so
-- the added write cost is negligible. Each event records when, who (the actor)
-- and what. Names are snapshotted into *_label columns so the log stays
-- readable even after a person is renamed or deleted.

-- Append-only: an audit row must outlive the people it references (and must be
-- insertable *while* a person is being deleted, when an FK to people would
-- fail). So actor/target ids are plain uuids — the *_label snapshots carry the
-- display name, and the UI filters people by label, not by id.
create table public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  -- Who made the change. Null when performed by the system (e.g. setup wizard)
  -- or a path with no identifiable caller.
  actor_person_id  uuid,
  actor_label      text,
  -- What happened, e.g. 'person.add', 'person.role_change', 'team.leader_add'.
  action           text not null,
  -- The person the change is about (the common filter dimension).
  target_person_id uuid,
  target_label     text,
  summary          text not null,
  metadata         jsonb
);

-- Indexes for the three filters: newest-first scans, by target person, by
-- actor, and by event type.
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_target_idx
  on public.audit_log (target_person_id, created_at desc);
create index audit_log_actor_idx
  on public.audit_log (actor_person_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;

-- Base table privilege: signed-in users may SELECT (RLS narrows this to admins
-- below). Granted explicitly so the log is readable regardless of which role
-- runs the migration, rather than relying on platform default privileges. No
-- insert/update/delete grant — writes happen only via the security-definer
-- triggers (which run as the table owner and bypass both grants and RLS), so
-- the log cannot be forged or tampered with from a client.
grant select on public.audit_log to authenticated;

-- Admin-readable only.
create policy "Admins read audit log"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- Resolve the acting person. For authenticated (browser) requests this is the
-- JWT's person. Edge Functions run with the service role and no end-user JWT,
-- so they pass the caller's person id in an `x-audit-actor` header, which we
-- trust *only* for service-role requests (an authenticated client cannot spoof
-- another actor this way).
create or replace function public.current_actor_person_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_hdr  text;
begin
  begin
    v_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role' then
    begin
      v_hdr := current_setting('request.headers', true)::json ->> 'x-audit-actor';
    exception when others then
      v_hdr := null;
    end;
    if v_hdr is null or v_hdr = '' then
      return null;
    end if;
    return v_hdr::uuid;
  end if;

  return public.current_person_id();
end;
$$;

-- Single insert helper used by every trigger.
create or replace function public.audit_record(
  p_action           text,
  p_target_person_id uuid,
  p_target_label     text,
  p_summary          text,
  p_metadata         jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := public.current_actor_person_id();
  v_actor_label text;
begin
  if v_actor is not null then
    select nullif(trim(first_name || ' ' || last_name), '')
      into v_actor_label
      from public.people
      where id = v_actor;
  end if;

  insert into public.audit_log (
    actor_person_id, actor_label, action,
    target_person_id, target_label, summary, metadata
  )
  values (
    v_actor, v_actor_label, p_action,
    p_target_person_id, p_target_label, p_summary, p_metadata
  );
end;
$$;

-- people: add / role change / archive / reactivate / delete -------------------
create or replace function public.audit_people()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if tg_op = 'INSERT' then
    v_label := trim(new.first_name || ' ' || new.last_name);
    perform public.audit_record(
      'person.add', new.id, v_label,
      'Added ' || v_label,
      jsonb_build_object('role', new.role));
    return new;

  elsif tg_op = 'DELETE' then
    v_label := trim(old.first_name || ' ' || old.last_name);
    perform public.audit_record(
      'person.delete', old.id, v_label,
      'Deleted ' || v_label, null);
    return old;

  elsif tg_op = 'UPDATE' then
    v_label := trim(new.first_name || ' ' || new.last_name);
    if new.role is distinct from old.role then
      perform public.audit_record(
        'person.role_change', new.id, v_label,
        'Role changed from ' || old.role || ' to ' || new.role,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
    if new.status is distinct from old.status then
      if new.status = 'inactive' then
        perform public.audit_record(
          'person.archive', new.id, v_label, 'Archived ' || v_label, null);
      elsif new.status = 'active' then
        perform public.audit_record(
          'person.reactivate', new.id, v_label, 'Reactivated ' || v_label, null);
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

create trigger audit_people_aiud
  after insert or update or delete on public.people
  for each row execute function public.audit_people();

-- team_members: added to / removed from a team --------------------------------
create or replace function public.audit_team_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
  v_name   text;
  v_team   text;
begin
  if tg_op = 'INSERT' then
    v_person := new.person_id;
    select nullif(trim(p.first_name || ' ' || p.last_name), ''), t.name
      into v_name, v_team
      from public.people p, public.teams t
      where p.id = new.person_id and t.id = new.team_id;
    perform public.audit_record(
      'team.member_add', v_person, v_name,
      coalesce(v_name, 'Person') || ' added to team ' || coalesce(v_team, '(deleted)'),
      jsonb_build_object('team_id', new.team_id, 'team', v_team));
    return new;
  else
    v_person := old.person_id;
    select nullif(trim(p.first_name || ' ' || p.last_name), ''), t.name
      into v_name, v_team
      from public.people p
      left join public.teams t on t.id = old.team_id
      where p.id = old.person_id;
    perform public.audit_record(
      'team.member_remove', v_person, v_name,
      coalesce(v_name, 'Person') || ' removed from team ' || coalesce(v_team, '(deleted)'),
      jsonb_build_object('team_id', old.team_id, 'team', v_team));
    return old;
  end if;
end;
$$;

create trigger audit_team_members_aid
  after insert or delete on public.team_members
  for each row execute function public.audit_team_members();

-- team_leaders / team_viewers: granted / revoked ------------------------------
-- One trigger function parameterised by the grant kind via tg_argv.
create or replace function public.audit_team_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind     text := tg_argv[0];        -- 'leader' or 'viewer'
  v_person   uuid;
  v_team_id  uuid;
  v_name     text;
  v_team     text;
  v_added    boolean := (tg_op = 'INSERT');
begin
  if v_added then
    v_person := new.person_id; v_team_id := new.team_id;
  else
    v_person := old.person_id; v_team_id := old.team_id;
  end if;

  select nullif(trim(p.first_name || ' ' || p.last_name), ''), t.name
    into v_name, v_team
    from public.people p
    left join public.teams t on t.id = v_team_id
    where p.id = v_person;

  perform public.audit_record(
    'team.' || v_kind || (case when v_added then '_add' else '_remove' end),
    v_person, v_name,
    coalesce(v_name, 'Person')
      || (case when v_added then ' added as ' else ' removed as ' end)
      || v_kind || ' of team ' || coalesce(v_team, '(deleted)'),
    jsonb_build_object('team_id', v_team_id, 'team', v_team));

  if v_added then return new; else return old; end if;
end;
$$;

create trigger audit_team_leaders_aid
  after insert or delete on public.team_leaders
  for each row execute function public.audit_team_grant('leader');

create trigger audit_team_viewers_aid
  after insert or delete on public.team_viewers
  for each row execute function public.audit_team_grant('viewer');
