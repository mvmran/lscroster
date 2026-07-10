-- Team types (issue #133 rework): mark which teams are *worship* teams so the
-- set-list email knows whose roster belongs in its "who's serving" rows.
-- Hardcoded list — 'media' is reserved for future use (e.g. media-only
-- comms); everything else stays 'general'. Set on the team create/edit dialogs.

create type public.team_type as enum ('general', 'worship', 'media');

alter table public.teams
  add column team_type public.team_type not null default 'general';
