-- Migration 0001 — foundation schema
-- app_role enum, church_settings (single row), people, updated_at triggers, RLS.

-- Roles --------------------------------------------------------------------

create type public.app_role as enum ('admin', 'leader', 'member');

-- updated_at trigger --------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- church_settings -----------------------------------------------------------
-- Single-tenant: exactly one row, created by the first-run setup wizard
-- (via the `setup` Edge Function, which uses the service role).

create table public.church_settings (
  id uuid primary key default gen_random_uuid(),
  -- enforce a single row
  singleton boolean not null default true unique check (singleton),
  name text not null,
  logo_url text,
  timezone text not null default 'Australia/Sydney',
  email_from_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger church_settings_set_updated_at
  before update on public.church_settings
  for each row execute function public.set_updated_at();

-- people ---------------------------------------------------------------------
-- Canonical person record. May exist without a login; auth_user_id is linked
-- once the person accepts an email invitation (Phase 1).

create table public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  role public.app_role not null default 'member',
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index people_email_unique
  on public.people (lower(email))
  where email is not null;

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

-- Role helpers ----------------------------------------------------------------
-- security definer so policies on `people` can call them without RLS recursion.

create or replace function public.current_person_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.people where auth_user_id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_person_role() = 'admin', false);
$$;

-- RLS --------------------------------------------------------------------------

alter table public.church_settings enable row level security;
alter table public.people enable row level security;

-- church_settings: readable pre-auth (sign-in page branding + first-run check).
-- Insert happens only via the `setup` Edge Function (service role bypasses RLS).
create policy "Anyone can read church settings"
  on public.church_settings for select
  to anon, authenticated
  using (true);

create policy "Admins can update church settings"
  on public.church_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- people: users see their own record; admins manage everyone.
create policy "Users can view their own person record"
  on public.people for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

create policy "Admins can view all people"
  on public.people for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert people"
  on public.people for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update people"
  on public.people for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete people"
  on public.people for delete
  to authenticated
  using (public.is_admin());
