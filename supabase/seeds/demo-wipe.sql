-- ============================================================================
-- Remove the LSCroster demo data loaded by demo-data.sql (Phase 5).
--
-- Every demo row has an id beginning `0de00`, so this deletes exactly what the
-- demo seed created and leaves your own church data untouched. Child rows
-- (order-of-service items, plan times, rosters, team positions, arrangements
-- and lyrics) go with their parents via ON DELETE CASCADE.
--
--   Local:  docker exec -i supabase_db_lscroster psql -U postgres -d postgres \
--             < supabase/seeds/demo-wipe.sql
--   Hosted: Supabase Dashboard -> SQL Editor -> paste this file -> Run
--
-- Safe to run twice; deleting nothing is not an error.
-- ============================================================================

begin;

-- Order matters only for readability: each delete cascades to its children.
delete from public.plan_assignments where id::text like '0de00%';
delete from public.plan_items       where id::text like '0de00%';
delete from public.plan_times       where id::text like '0de00%';
delete from public.plans            where id::text like '0de00%';

delete from public.service_type_teams where id::text like '0de00%';
delete from public.service_types      where id::text like '0de00%';

-- Deleting a song drops its junction row; the last link going away deletes the
-- orphaned arrangement (and its lyrics and attachments) by trigger.
delete from public.songs where id::text like '0de00%';

delete from public.team_members where id::text like '0de00%';
delete from public.positions    where id::text like '0de00%';
delete from public.teams        where id::text like '0de00%';
delete from public.people       where id::text like '0de00%';

commit;

do $$
begin
  raise notice 'Demo data removed.';
end $$;
