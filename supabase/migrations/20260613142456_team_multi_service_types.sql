-- Migration 0009 — A team can serve multiple service types (issue #13)
-- Unifies the team↔service-type relationship onto the existing
-- service_type_teams join (added in 0008 for "teams a service type requires").
-- The single nullable teams.service_type_id FK is backfilled into the join and
-- dropped. A team with no rows in service_type_teams serves every service type,
-- preserving the old `service_type_id is null` = "all service types" default.

-- Backfill: every team that was scoped to one service type gets a join row.
-- on conflict guards against a row 0008 may already have created from the
-- service-type side.
insert into public.service_type_teams (service_type_id, team_id)
select t.service_type_id, t.id
from public.teams t
where t.service_type_id is not null
on conflict (service_type_id, team_id) do nothing;

alter table public.teams drop column service_type_id;

-- service_type_teams is now edited from two places: the service-type editor
-- (admin-only, "required teams") and the team editor (leaders manage their
-- teams). Widen the write policy from admin-only to match team management.
drop policy "Admins manage service type teams" on public.service_type_teams;

create policy "Leaders manage service type teams"
  on public.service_type_teams for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
