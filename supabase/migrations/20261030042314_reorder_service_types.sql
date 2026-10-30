-- Migration 0073 — Reordering service types writes the whole order at once.
-- Found by `/code-review`. Re-runnable.
--
-- The app saved a drag of the service types as one update per row, sent side
-- by side from the browser. Two quick drags could land interleaved, leaving a
-- blend of both orders (and duplicate sort_order values), and a failure part
-- way left some rows moved and others not. This sets `sort_order` and nothing
-- else, in one statement, as reorder_plan_items (0066) does for a plan.
--
-- Service types the caller didn't list (added by someone else meanwhile) keep
-- their relative order after the listed ones. Ids that are gone are skipped.
-- Security invoker: service_types' RLS still decides who may reorder.
create or replace function public.reorder_service_types(p_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  with listed as (
    select o.id, o.ord
    from unnest(coalesce(p_ids, '{}')) with ordinality as o (id, ord)
    join public.service_types st on st.id = o.id
  ),
  numbered as (
    select id, row_number() over (order by ord) as pos from listed
  ),
  unlisted as (
    select st.id,
           (select count(*) from numbered)
             + row_number() over (order by st.sort_order, st.created_at) as pos
    from public.service_types st
    where not exists (select 1 from listed l where l.id = st.id)
  ),
  target as (
    select id, pos from numbered
    union all
    select id, pos from unlisted
  )
  update public.service_types st
  set sort_order = (t.pos - 1)::integer
  from target t
  where st.id = t.id
    and st.sort_order is distinct from (t.pos - 1)::integer;
$$;

revoke all on function public.reorder_service_types(uuid[]) from public, anon;
grant execute on function public.reorder_service_types(uuid[])
  to authenticated, service_role;
