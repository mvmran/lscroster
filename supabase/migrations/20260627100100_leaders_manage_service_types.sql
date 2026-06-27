-- Migration 0031 — Leaders can manage service types (issue #125)
-- Service types were admin-only church configuration. Leaders plan services and
-- need to create/edit the recurring gatherings, so widen the management policy
-- from admin-only to admin-or-leader. Read access is unchanged (everyone signed
-- in already reads them). The service_type_teams "required teams" join was
-- already widened to admin-or-leader back in migration 0008, so it needs no
-- change here.

drop policy "Admins manage service types" on public.service_types;
create policy "Leaders manage service types"
  on public.service_types for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
