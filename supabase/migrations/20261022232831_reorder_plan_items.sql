-- Migration 0066 — A drag-reorder of the order of service writes only the
-- order. Found by `/code-review`. Re-runnable.
--
-- The app saved a reorder by upserting every item's full row from its cached
-- copy. With two editors on one plan, a stale cache re-inserted items the
-- other had deleted and wrote back the old title, key, description and the
-- rest over their edits. This sets `sort_order` and nothing else, only on rows
-- that still exist on that plan, in one statement.
--
-- Items the caller didn't list (added by someone else meanwhile) keep their
-- relative order after the listed ones rather than colliding with them. Ids
-- that are gone are skipped. Security invoker: plan_items' RLS and the
-- protect_plan_item_columns trigger still decide who may reorder.
create or replace function public.reorder_plan_items(
  p_plan_id  uuid,
  p_item_ids uuid[]
)
returns void
language sql
security invoker
set search_path = public
as $$
  with listed as (
    select o.id, o.ord
    from unnest(coalesce(p_item_ids, '{}')) with ordinality as o (id, ord)
    join public.plan_items pi on pi.id = o.id and pi.plan_id = p_plan_id
  ),
  numbered as (
    select id, row_number() over (order by ord) as pos from listed
  ),
  unlisted as (
    select pi.id,
           (select count(*) from numbered)
             + row_number() over (order by pi.sort_order, pi.created_at) as pos
    from public.plan_items pi
    where pi.plan_id = p_plan_id
      and not exists (select 1 from listed l where l.id = pi.id)
  ),
  target as (
    select id, pos from numbered
    union all
    select id, pos from unlisted
  )
  update public.plan_items pi
  set sort_order = (t.pos - 1)::integer
  from target t
  where pi.id = t.id
    and pi.plan_id = p_plan_id
    and pi.sort_order is distinct from (t.pos - 1)::integer;
$$;

revoke all on function public.reorder_plan_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_plan_items(uuid, uuid[])
  to authenticated, service_role;
