-- Migration 0002 — People module
-- Extends people with profile fields, adds invitations, the private photos
-- bucket, and the directory/self-service RLS model.

-- person status ---------------------------------------------------------------

create type public.person_status as enum ('active', 'inactive');

alter table public.people
  add column phone text,
  add column photo_url text,
  add column birthday date,
  add column status public.person_status not null default 'active',
  add column notes text;

-- invitations -----------------------------------------------------------------
-- One pending invitation per person. The raw token only ever lives in the
-- emailed link; we store its sha-256 hash. Created/updated exclusively by the
-- `invite` Edge Function (service role); admins read them for UI status.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

alter table public.invitations enable row level security;

create policy "Admins manage invitations"
  on public.invitations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Role helpers ------------------------------------------------------------------

create or replace function public.is_admin_or_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_person_role() in ('admin', 'leader'), false);
$$;

create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.people where auth_user_id = (select auth.uid());
$$;

-- people RLS: directory visibility + self-service updates -----------------------
-- Everyone signed in sees active people (it's a church directory); admins and
-- leaders also see inactive ones; you can always see yourself.

drop policy "Users can view their own person record" on public.people;
drop policy "Admins can view all people" on public.people;

create policy "Authenticated can view directory"
  on public.people for select
  to authenticated
  using (
    status = 'active'
    or public.is_admin_or_leader()
    or auth_user_id = (select auth.uid())
  );

create policy "Users can update their own person record"
  on public.people for update
  to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- Non-admins may only touch their own contact fields; role, status, email,
-- notes and the auth link are admin-only. Row policies can't restrict columns,
-- so a trigger guards them. auth.role() is null for direct DB connections
-- (migrations, seeds) and 'service_role' for Edge Functions — both bypass.
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
     or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'You are not allowed to change these fields';
  end if;
  return new;
end;
$$;

create trigger people_protect_columns
  before update on public.people
  for each row execute function public.protect_people_columns();

-- photos bucket -------------------------------------------------------------------
-- Private; served via signed URLs. Object paths are `{person_id}/{filename}`,
-- so members can manage only their own folder while admins manage all.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "Authenticated can view photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photos');

create policy "Admins can manage all photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());

create policy "Users can manage their own photo folder"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_person_id()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_person_id()::text
  );
