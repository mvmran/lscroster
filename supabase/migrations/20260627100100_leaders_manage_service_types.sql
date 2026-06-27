-- Migration 0031 — Leaders can manage service types (issue #125)
-- Service types were admin-only church configuration. Leaders plan services and
-- need to create/edit the recurring gatherings (and their required teams), so
-- widen the management policies from admin-only to admin-or-leader. Read access
-- is unchanged (everyone signed in already reads them).

drop policy "Admins manage service types" on public.service_types;
create policy "Leaders manage service types"
  on public.service_types for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

drop policy "Admins manage service type teams" on public.service_type_teams;
create policy "Leaders manage service type teams"
  on public.service_type_teams for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
