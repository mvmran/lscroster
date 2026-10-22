-- Migration 0061 — people_directory is read-only, and only for signed-in users.
-- The view runs as its owner (it has to: it reads email, phone, birthday and
-- notes, which `authenticated` cannot select, and masks them per viewer), so
-- row-level security on `people` never applies through it. Postgres also
-- treats it as auto-updatable. Until now it carried Supabase's default grants,
-- which 0050 wrote down explicitly: select, insert, update and delete for
-- anon and authenticated. Through the Data API that let anyone holding the
-- public anon key read every active person and rename or delete them, and let
-- any member delete anyone or set managed_by_person_id on anyone (unmasking
-- their contact details). protect_people_columns does not stop either.
--
-- Every read in the app is a signed-in select; writes go to `people`, where
-- RLS and the column triggers apply. No Edge Function uses the view. So:
-- nothing for anon, select only for authenticated (and service_role).
--
-- The grants survive `create or replace view`. A migration that drops and
-- recreates the view must repeat these lines. Re-runnable.

revoke all on public.people_directory from public, anon, authenticated, service_role;
grant select on public.people_directory to authenticated, service_role;
