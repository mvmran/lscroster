-- Migration 0027 — People contact-detail visibility (issue #119)
-- Email, phone and birthday are personal contact details that should only be
-- visible to people with a legitimate need:
--   * admins and global leaders — the whole directory (unchanged);
--   * the person themselves;
--   * a member who manages their account (issue #89);
--   * a Team Leader (issue #57 grant) for the members of a team they lead.
-- Everyone else sees names, role and photo only.
--
-- RLS is row-level, not column-level, so hiding columns is enforced in two
-- parts that together make this real at the API level (not just hidden UI):
--   1. Revoke direct SELECT on the three contact columns from the client roles
--      (authenticated/anon) by granting SELECT on only the non-sensitive
--      columns. Edge Functions use the service role and keep full access;
--      migrations/seeds run as the table owner and bypass grants.
--   2. Expose a masked view `people_directory` that the app reads instead of
--      the base table: it runs as its owner (so it can read the locked columns),
--      re-applies the base directory row visibility, and blanks
--      email/phone/birthday for viewers who fail can_view_contact().
-- A generated `has_email` boolean stays selectable so scheduling can still tell
-- whether a person is emailable without exposing the address itself.

-- 1. can_view_contact --------------------------------------------------------
-- security definer so it can consult team_members/team_leaders without RLS
-- recursion (mirrors manages_person / leads_team).
create or replace function public.can_view_contact(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_or_leader()
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

-- 2. has_email — a non-sensitive "is this person emailable?" flag so the
--    scheduling UI can show "Send email" without reading the address.
alter table public.people
  add column has_email boolean not null generated always as (email is not null) stored;

-- 3. Lock the contact columns away from the client roles. Postgres tracks
--    table-level and column-level grants separately, so we drop the blanket
--    SELECT and grant it back on the non-sensitive columns only.
revoke select on public.people from authenticated, anon;

grant select (
  id, first_name, last_name, role, status, photo_url, notes,
  auth_user_id, managed_by_person_id, managed_accepted_at, has_email,
  created_at, updated_at
) on public.people to authenticated;

-- 4. The masked directory view the app reads. security_invoker is OFF (default)
--    so the body runs as the view owner (the migration role, which bypasses RLS
--    and may read the locked columns); the WHERE clause re-applies the base
--    directory visibility and the CASE expressions mask the three columns.
create view public.people_directory as
  select
    p.id,
    p.first_name,
    p.last_name,
    p.role,
    p.status,
    p.photo_url,
    p.notes,
    p.auth_user_id,
    p.managed_by_person_id,
    p.managed_accepted_at,
    p.has_email,
    p.created_at,
    p.updated_at,
    case when public.can_view_contact(p.id) then p.email else null end as email,
    case when public.can_view_contact(p.id) then p.phone else null end as phone,
    case when public.can_view_contact(p.id) then p.birthday else null end as birthday
  from public.people p
  where
    p.status = 'active'
    or public.is_admin_or_leader()
    or p.auth_user_id = (select auth.uid())
    or public.manages_person(p.id);

grant select on public.people_directory to authenticated;
