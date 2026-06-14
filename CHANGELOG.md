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
- A leader can **send the request email to one person** from their actions
  menu on a plan, including someone who has already confirmed ([#15]).
- Publishing a plan now **emails everyone scheduled on it** a full summary —
  service type, date, time and duration, every labelled time (rehearsal etc.),
  the church name and address, who's serving grouped by team, the order of
  service, and the songs with their key and BPM ([#17]).
- Admins can edit the **church name and address** from Settings → Church; the
  address is shown on plan-publish emails ([#17]).

### Removed
- The per-team **team-leader designation** added for [#2] has been removed
  ([#10]). Assigning multiple positions to a member (#1) is unaffected.

### Changed
- A team can now serve **multiple service types** instead of just one. The
  team add/edit screen uses a service-type multi-select; leaving it empty means
  the team appears on every service type's plans (the old default). This reuses
  the same `service_type_teams` join as a service type's "required teams", so
  the two screens are now two views of one relationship ([#13]).
- Left navigation order is now Home, My Schedule, People, Teams, Services,
  Songs, Settings ([#5]).
- Light mode now uses a pastel pink→blue gradient for the top bar and the
  side menu, with a white content area; dark mode is unchanged ([#8]).
- The scheduling person picker now highlights members already set up for the
  position being filled, under a "Set up for this position" group, while still
  allowing anyone to be selected ([#12]).
- The double-booking warning when scheduling now fires **only when the two
  services' times actually overlap**, not merely fall on the same day, so a
  person on two services at different times the same day is no longer flagged
  ([#14]).
- Removing a **confirmed** person from a plan now reads **"Remove and Notify"**
  and emails them a cancellation notice; removing someone who hasn't confirmed
  stays a plain "Remove" with no email ([#16]). This now also applies to the
  **matrix view** — removing a confirmed person from a cell sends the same
  cancellation email ([#21]).
- Bulk email sends (scheduling requests, plan-publish notifications, reminders
  and nudges) now go out through Resend's **Batch API** — up to 100 emails per
  request instead of one call each — and every Resend call is **rate-limited to
  stay under 2 requests/second**, so rostering a large team no longer trips
  Resend's throttle ([#18]).

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
- Migration `20260613142456_team_multi_service_types` (#13) **backfills each
  team's existing `service_type_id` into the `service_type_teams` join, then
  drops the `teams.service_type_id` column.** Teams that served "all service
  types" (null) get no join rows and continue to serve all. The write policy on
  `service_type_teams` widens from admin-only to admin-or-leader so leaders can
  scope their own teams. The upgrade is automatic via `supabase db push`; no
  manual data steps are required and no emails or links change.
- Migration `20260614090000_church_address` (#17) adds a nullable
  `church_settings.address` column. It applies automatically via
  `supabase db push`; no manual steps, and no emails or links change.
- The Resend Batch API change (#18) is **code-only — no schema change**. It
  ships by redeploying the `send-requests`, `send-plan-notification` and
  `reminders` Edge Functions (which share `_shared/resend.ts`); email content
  and links are unchanged.

[#1]: https://github.com/mvmran/lscroster/issues/1
[#2]: https://github.com/mvmran/lscroster/issues/2
[#5]: https://github.com/mvmran/lscroster/issues/5
[#8]: https://github.com/mvmran/lscroster/issues/8
[#10]: https://github.com/mvmran/lscroster/issues/10
[#11]: https://github.com/mvmran/lscroster/issues/11
[#12]: https://github.com/mvmran/lscroster/issues/12
[#13]: https://github.com/mvmran/lscroster/issues/13
[#14]: https://github.com/mvmran/lscroster/issues/14
[#15]: https://github.com/mvmran/lscroster/issues/15
[#16]: https://github.com/mvmran/lscroster/issues/16
[#17]: https://github.com/mvmran/lscroster/issues/17
[#18]: https://github.com/mvmran/lscroster/issues/18
[#21]: https://github.com/mvmran/lscroster/issues/21
