-- Migration 0064 — Applying a permission template is one transaction. Found by
-- `/code-review`. Re-runnable.
--
-- The app applied a template as three requests: read the grants, delete the
-- ones the template drops, insert the ones it adds. An insert that failed after
-- the delete had landed left the person with fewer grants than either the old
-- set or the template. One function call is one transaction, so now all of it
-- lands or none does.
--
-- Security invoker (the default, spelled out): person_permissions' own RLS
-- still decides who may grant and revoke (admins and coordinators, 0045). Only
-- the difference is written, so the per-row audit trigger (0045) records just
-- what changed, as it did before.
create or replace function public.replace_person_permissions(
  p_person_id   uuid,
  p_permissions public.app_permission[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wanted public.app_permission[] := coalesce(p_permissions, '{}');
begin
  delete from public.person_permissions
  where person_id = p_person_id
    and permission <> all (v_wanted);

  insert into public.person_permissions (person_id, permission)
  select distinct p_person_id, wanted
  from unnest(v_wanted) as wanted
  on conflict (person_id, permission) do nothing;
end;
$$;

revoke all on function public.replace_person_permissions(uuid, public.app_permission[])
  from public, anon;
grant execute on function public.replace_person_permissions(uuid, public.app_permission[])
  to authenticated, service_role;
