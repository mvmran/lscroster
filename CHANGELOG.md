# Changelog

All notable changes to LSCRoster are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Team members can be assigned **multiple positions** on a team instead of a
  single default ([#1]). Positions are picked from a dropdown on the team page
  and shown on the person's profile.
- Team members can be flagged as **team leaders** ([#2]). A star toggle on the
  team page marks a leader, and a "Leader" badge appears on the team and the
  person's profile. This is a label only — management permissions remain the
  global admin/leader role.

### Changed
- Left navigation order is now Home, My Schedule, People, Teams, Services,
  Songs, Settings ([#5]).

### Migration / upgrade notes
- Migration `20260613052530_teams_multi_position_and_leaders` adds the
  `team_member_positions` table and a `team_members.is_leader` flag. It
  **migrates each member's existing `default_position_id` into the new table,
  then drops that column.** The upgrade is automatic via `supabase db push`;
  no manual data steps are required and no emails or links change.

[#1]: https://github.com/mvmran/lscroster/issues/1
[#2]: https://github.com/mvmran/lscroster/issues/2
[#5]: https://github.com/mvmran/lscroster/issues/5
