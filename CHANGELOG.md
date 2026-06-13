# Changelog

All notable changes to LSCRoster are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Team members can be assigned **multiple positions** on a team instead of a
  single default ([#1]). Positions are picked from a dropdown on the team page
  and shown on the person's profile.
- Service types now capture **frequency**, the **days of the week** they run,
  a **start and end time**, and the **teams they require** — all from the
  add/edit service type screen ([#11]).

### Removed
- The per-team **team-leader designation** added for [#2] has been removed
  ([#10]). Assigning multiple positions to a member (#1) is unaffected.

### Changed
- Left navigation order is now Home, My Schedule, People, Teams, Services,
  Songs, Settings ([#5]).
- Light mode now uses a pastel pink→blue gradient for the top bar and the
  side menu, with a white content area; dark mode is unchanged ([#8]).
- The scheduling person picker now highlights members already set up for the
  position being filled, under a "Set up for this position" group, while still
  allowing anyone to be selected ([#12]).

### Migration / upgrade notes
- Migration `20260613052530_teams_multi_position_and_leaders` adds the
  `team_member_positions` table. It **migrates each member's existing
  `default_position_id` into the new table, then drops that column.** The
  upgrade is automatic via `supabase db push`; no manual data steps are
  required and no emails or links change.
- Migration `20260613105259_remove_team_leader_flag` drops the
  `team_members.is_leader` column (reverts #2). Migration
  `20260613105308_service_type_scheduling_details` adds `frequency`,
  `days_of_week` and `end_time` to `service_types` plus a `service_type_teams`
  join table. Both apply automatically via `supabase db push`.

[#1]: https://github.com/mvmran/lscroster/issues/1
[#2]: https://github.com/mvmran/lscroster/issues/2
[#5]: https://github.com/mvmran/lscroster/issues/5
[#8]: https://github.com/mvmran/lscroster/issues/8
[#10]: https://github.com/mvmran/lscroster/issues/10
[#11]: https://github.com/mvmran/lscroster/issues/11
[#12]: https://github.com/mvmran/lscroster/issues/12
