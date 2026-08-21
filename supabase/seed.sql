-- ============================================================================
-- LOCAL-ONLY bootstrap, run by `npx supabase db reset --local` after the
-- migrations. Seeds never run against a hosted Supabase project, so nothing
-- here reaches production.
--
-- It deliberately loads NO data: a fresh local stack should land on the
-- first-run setup wizard, exactly like a brand-new church instance. For demo
-- content, load `seeds/demo-data.sql` yourself (see docs/SETUP.md).
--
-- What it does fix is a local CLI quirk: on some CLI/Postgres image versions the
-- `public` schema's default privileges for the `postgres` owner come out as only
-- TRUNCATE/REFERENCES/TRIGGER, so `anon`/`authenticated`/`service_role` end up
-- with no SELECT/INSERT on any table and every PostgREST call fails with 42501 —
-- before RLS is even consulted. A hosted project grants these correctly, which
-- is why this belongs in a local seed and NOT in a migration.
--
-- Row-level security is untouched: these are table-level grants, and every
-- policy still applies on top of them.
-- ============================================================================

do $$
declare
  rel record;
begin
  -- Tables and views, except `people` (handled below).
  for rel in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p')
      and c.relname <> 'people'
  loop
    execute format(
      'grant select, insert, update, delete on public.%I to anon, authenticated, service_role',
      rel.relname
    );
  end loop;
end $$;

-- `people` keeps the column-level SELECT lock from migration 0024
-- (people_contact_visibility): email/phone/birthday stay revoked from anon and
-- authenticated, which is why it is excluded from the loop above. A blanket
-- grant here would silently undo that and hide a real security regression.
grant insert, update, delete on public.people to anon, authenticated;
grant select, insert, update, delete on public.people to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Objects created after this point in the same session (there are none during a
-- reset, but keep the environment consistent for ad-hoc local experiments).
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

do $$
begin
  raise notice 'Local grants repaired. The instance is empty - open the app to run the setup wizard.';
end $$;
