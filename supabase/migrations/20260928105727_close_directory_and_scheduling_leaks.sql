-- Migration 0046 — Close two directory/scheduling read leaks found while
-- mapping the permission model (PHASES.md, "Found while mapping").
--
-- Leak 1: people.notes was SELECT-able by every authenticated client. The
--   column was granted to `authenticated` (migration 0027) and the
--   `people_directory` view returned it unmasked, though the UI has always
--   said notes are visible to admins and coordinators only. Any member could
--   read anyone's admin notes through the API.
-- Leak 2: person_scheduling_prefs, person_recurring_unavailability and
--   person_pairings each had a `SELECT using (true)` policy, so every member
--   could read everyone's scheduling preferences, recurring unavailability and
--   prefer/avoid pairings. Only people who schedule need these: admins and
--   coordinators (who manage them and validate rosters), and Team Leaders
--   (whose roster validation reads everyone's rules). Everyone else needs none.
--
-- The plan-attachments storage leak from the same list is NOT addressed here:
-- tightening it means dropping the permissive SELECT policy on
-- storage.objects, which the migration role does not own (see the note in
-- 0045 and CLAUDE.md). It needs a privileged step and is tracked separately.

-- 1. Mask people.notes -------------------------------------------------------
-- Re-declare people_directory (unchanged but for the notes column) so notes is
-- blanked for anyone who is not an admin or coordinator, matching email/phone/
-- birthday. The view runs as its owner, so it still reads the base column.
create or replace view public.people_directory as
  select
    p.id,
    p.first_name,
    p.last_name,
    p.role,
    p.status,
    p.photo_url,
    case when public.is_admin_or_coordinator() then p.notes else null end as notes,
    p.auth_user_id,
    p.managed_by_person_id,
    p.managed_accepted_at,
    p.has_email,
    p.created_at,
    p.updated_at,
    case when public.can_view_contact(p.id) then p.email else null end as email,
    case when public.can_view_contact(p.id) then p.phone else null end as phone,
    case when public.can_view_contact(p.id) then p.birthday else null end as birthday,
    p.sex
  from public.people p
  where
    p.status = 'active'
    or public.is_admin_or_coordinator()
    or p.auth_user_id = (select auth.uid())
    or public.manages_person(p.id);

-- And lock the base column away from the client roles, so notes cannot be read
-- by selecting it from `people` directly (the view is the only client path,
-- and it now masks it). Edge Functions use the service role; migrations/seeds
-- run as the table owner — both keep full access.
revoke select (notes) on public.people from authenticated, anon;

-- 2. Restrict the three per-person scheduling tables to schedulers -----------
-- leads_any_team(): does the current person hold any Team Leader grant?
-- security definer to consult team_leaders without RLS recursion, mirroring
-- leads_team()/can_manage_team().
create or replace function public.leads_any_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_leaders
    where person_id = public.current_person_id()
  );
$$;

drop policy "Authenticated can view scheduling prefs" on public.person_scheduling_prefs;
create policy "Schedulers view scheduling prefs"
  on public.person_scheduling_prefs for select to authenticated
  using (public.is_admin_or_coordinator() or public.leads_any_team());

drop policy "Authenticated can view recurring unavailability" on public.person_recurring_unavailability;
create policy "Schedulers view recurring unavailability"
  on public.person_recurring_unavailability for select to authenticated
  using (public.is_admin_or_coordinator() or public.leads_any_team());

drop policy "Authenticated can view pairings" on public.person_pairings;
create policy "Schedulers view pairings"
  on public.person_pairings for select to authenticated
  using (public.is_admin_or_coordinator() or public.leads_any_team());
