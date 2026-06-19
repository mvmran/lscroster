-- Migration 0019 — drop team exclusions (issue #76)
-- The cross-team "can't share a member" rule is being removed entirely: it was
-- the only team-level scheduling rule and is managed through a Teams-screen
-- button we're also removing. The per-position requirements (min/max count,
-- requires_level, fill_priority) on `positions` are unaffected.
-- Re-runnable; dropping the table also drops its RLS policies.

drop table if exists public.team_exclusions;
