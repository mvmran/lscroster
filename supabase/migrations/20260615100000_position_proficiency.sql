-- Migration 0012 — Position proficiency (issue #30)
-- A team member's eligibility for a position now carries a proficiency level, so
-- the roster knows who can serve a position independently vs. who is still
-- training. This is the data foundation for auto-scheduling; the scheduling
-- engine itself is a separate piece of work.
--
-- We extend the existing team_member_positions join (which already models "the
-- positions a member can fill") rather than introducing a parallel eligibility
-- table, keeping a single source of truth for who can serve what.

create type public.proficiency_level as enum ('trainee', 'qualified');

-- Existing rows are assumed qualified (the default); no backfill query needed.
alter table public.team_member_positions
  add column proficiency public.proficiency_level not null default 'qualified';

-- RLS is unchanged: the column lives on an already-protected table whose
-- existing policies (everyone reads, admins/leaders manage) cover it.
