-- Migration 0007 — Remove the team-leader designation (issue #10)
-- Reverts the team_members.is_leader column added in migration 0006 for
-- issue #2. The multiple-positions feature from #1 (team_member_positions)
-- is intentionally kept.

alter table public.team_members drop column if exists is_leader;
