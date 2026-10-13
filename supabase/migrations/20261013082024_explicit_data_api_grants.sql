-- Migration 0050 — Explicit Data API grants.
-- Until now no migration granted table access itself: every table and view in
-- `public` reached the Data API (PostgREST / supabase-js) through Supabase's
-- automatic default grants to anon, authenticated and service_role. From
-- 30 October 2026 Supabase stops granting automatically — on new projects, on
-- `supabase db reset`, and for tables a migration adds to an existing project.
-- A church setting up a new instance after that date would get "permission
-- denied" (42501) on every table, before RLS is even consulted.
--
-- This grants, explicitly, what every table and view has had so far. On an
-- existing project (production, any church already running) it changes nothing:
-- those grants are already there. On a fresh project it runs after every table
-- above it exists and makes them reachable. Re-runnable.
--
-- Row-level security is untouched: these are table-level grants, and every
-- policy still applies on top of them.
--
-- From here on, a migration that creates a table or view grants it in the same
-- file (CLAUDE.md, Database conventions).

-- 1. Tables and views, except `people` -----------------------------------------
do $$
declare
  rel record;
begin
  for rel in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p')
      and c.relname <> 'people'
      -- Objects an extension owns manage their own grants.
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'grant select, insert, update, delete on public.%I to anon, authenticated, service_role',
      rel.relname
    );
  end loop;
end $$;

-- 2. people ----------------------------------------------------------------------
-- SELECT stays column-level (0024 people_contact_visibility and later): a
-- table-wide grant would expose email, phone, birthday and notes again.
grant insert, update, delete on public.people to anon, authenticated;
grant select, insert, update, delete on public.people to service_role;

-- 3. Sequences ---------------------------------------------------------------------
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
