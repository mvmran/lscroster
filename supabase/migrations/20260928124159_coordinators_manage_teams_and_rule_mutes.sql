-- Migration 0047 — Coordinators manage every team; team leaders can mute rules.
-- Two governance decisions on the access-control rework (see docs/ACCESS-CONTROL.md):
--
-- 1a. A coordinator is church-wide governance, so managing any team's
--     membership, positions and roster should not need a per-team Team-Leader
--     grant. can_manage_team() was `is_admin() or leads_team()`; it becomes
--     `is_admin_or_coordinator() or leads_team()`. Every policy that gates team
--     content on can_manage_team() (team_members, positions,
--     team_member_positions, plan_assignments, per-plan min counts) picks this
--     up automatically. Team Leaders keep their per-team scope. The matching
--     client (useTeamPermissions) and Edge Function (teamScopeFor) checks are
--     widened in the same change.
--
-- 2a. Muting a conditional-rule warning on a plan is part of rostering, which
--     is team-scoped, so a Team Leader of a team on the plan can mute — not
--     just coordinators/admins.

-- 1a --------------------------------------------------------------------------
create or replace function public.can_manage_team(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_or_coordinator() or public.leads_team(target_team_id);
$$;

-- 2a --------------------------------------------------------------------------
drop policy "Coordinators manage plan rule mutes" on public.plan_rule_mutes;
create policy "Schedulers manage plan rule mutes"
  on public.plan_rule_mutes for all to authenticated
  using (public.is_admin_or_coordinator() or public.leads_team_on_plan(plan_id))
  with check (public.is_admin_or_coordinator() or public.leads_team_on_plan(plan_id));
