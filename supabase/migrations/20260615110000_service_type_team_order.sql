-- Migration 0013 — Ordering of a service type's required teams (issue #31)
-- The "Teams required" list on a service type is now manually orderable, and a
-- plan shows its teams in that order. We add a sort_order to the join and seed
-- it from the team's global order so existing service types keep their current
-- display order.

alter table public.service_type_teams
  add column sort_order integer not null default 0;

update public.service_type_teams stt
set sort_order = t.sort_order
from public.teams t
where t.id = stt.team_id;
