-- Migration 0021 — Managed accounts (issue #89)
-- A person without their own login can be looked after by an existing member
-- (e.g. a child whose parent already has an account). The managing member can
-- view, edit and respond to roster requests for the managed person — exactly as
-- that person could for themselves, never admin-level. The managed person may
-- still later be given their own email + login, which detaches the manager.

alter table public.people
  add column managed_by_person_id uuid references public.people (id) on delete set null,
  -- set when the manager confirms the invitation; drives the active/pending
  -- account status for managed people (who have no auth_user_id of their own).
  add column managed_accepted_at timestamptz,
  add constraint people_not_self_managed
    check (managed_by_person_id is null or managed_by_person_id <> id);

create index people_managed_by_idx on public.people (managed_by_person_id);

-- Does the signed-in person manage `target`? Security definer so policies on the
-- other tables can consult it without recursing through people's own RLS.
create or replace function public.manages_person(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.people child
    where child.id = target
      and child.managed_by_person_id = public.current_person_id()
  );
$$;

-- Guard the management link itself: only admins (and the service role) may set
-- or change who manages whom, or the accepted stamp — so a member can never
-- self-assign a manager to gain access to another account. Mirrors the existing
-- column guards; everything else a manager edits goes through the unchanged
-- self-service column rules below.
create or replace function public.protect_people_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), 'service_role') = 'service_role'
     or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.email is distinct from old.email
     or new.notes is distinct from old.notes
     or new.auth_user_id is distinct from old.auth_user_id
     or new.managed_by_person_id is distinct from old.managed_by_person_id
     or new.managed_accepted_at is distinct from old.managed_accepted_at then
    raise exception 'You are not allowed to change these fields';
  end if;
  return new;
end;
$$;

-- people: a manager can see and self-service-edit the people they manage. The
-- column guard above still blocks role/email/status/etc., so this stays
-- self-level rather than admin-level.
create policy "Managers can view their managed people"
  on public.people for select
  to authenticated
  using (public.manages_person(id));

create policy "Managers can update their managed people"
  on public.people for update
  to authenticated
  using (public.manages_person(id))
  with check (public.manages_person(id));

-- blockouts: a manager keeps the managed person's availability up to date.
create policy "Managers view managed blockouts"
  on public.blockout_dates for select
  to authenticated
  using (public.manages_person(person_id));

create policy "Managers manage managed blockouts"
  on public.blockout_dates for all
  to authenticated
  using (public.manages_person(person_id))
  with check (public.manages_person(person_id));

-- assignments: a manager sees and answers the managed person's requests in-app.
-- The protect_assignment_columns trigger still scopes them to the response
-- columns (status confirmed/declined), so this is "accept on behalf", not
-- arbitrary roster editing.
create policy "Managers view managed assignments"
  on public.plan_assignments for select
  to authenticated
  using (public.manages_person(person_id));

create policy "Managers respond to managed assignments"
  on public.plan_assignments for update
  to authenticated
  using (public.manages_person(person_id))
  with check (public.manages_person(person_id));

-- email preferences (issue #87): a manager edits the managed person's opt-outs.
create policy "Managers view managed email prefs"
  on public.person_email_prefs for select
  to authenticated
  using (public.manages_person(person_id));

create policy "Managers manage managed email prefs"
  on public.person_email_prefs for all
  to authenticated
  using (public.manages_person(person_id))
  with check (public.manages_person(person_id));

-- photos: a manager uploads/replaces the managed person's photo. Object paths
-- are `{person_id}/{filename}` (see migration 0002).
create or replace function public.manages_photo_folder(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.people p
    where p.managed_by_person_id = public.current_person_id()
      and p.id::text = (storage.foldername(object_name))[1]
  );
$$;

create policy "Managers manage managed photo folders"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'photos' and public.manages_photo_folder(name))
  with check (bucket_id = 'photos' and public.manages_photo_folder(name));
