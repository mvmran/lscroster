# Changelog

All notable changes to LSCRoster are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Auto-scheduler ("Suggest roster")** — the plan's People panel can now
  auto-fill its required spots from the scheduling rules. A deterministic engine
  fills scarce/specialist positions first, only picks people who pass every hard
  rule (eligibility, required level, availability, not already serving, team
  exclusions, hard-avoid pairs, and serving-frequency limits), and prefers those
  who've served least recently. It **previews** the suggestions (each with a
  short "why") and any spots it couldn't fill before you **add them as an
  editable draft** — which still runs through the live badges and publish gate.
  No black box: same inputs always give the same roster ([#35], part of [#32]).
- **Scheduling-rules validation & publish gate** — a plan now checks its roster
  against the scheduling rules live as you schedule people: red error / amber
  warning badges appear on positions and people in the **People** panel and the
  **Matrix** (understaffed positions show a red `+`). Publishing a plan with
  issues opens a **two-tier gate** listing the errors and warnings; errors need
  a typed reason to override, and every override is recorded for audit. No
  auto-scheduler yet — this is the shared validator the engine will reuse
  ([#34], part of [#32]).
- **Scheduling rules** (foundation for auto-scheduling) — per-person
  **preferences** (how often they serve, max/target per month, max in a row,
  scheduling status), **recurring unavailability** (e.g. every 1st Sunday,
  alongside the existing one-off blockouts), and **serve-with pairings**
  (prefer / avoid / household, each soft or strict) on the person page;
  **team exclusions** (teams that can't share a person in one service) from the
  Teams screen; and per-**position requirements** (minimum/maximum people,
  whether it needs a qualified person, and fill priority) on the team page. This
  ships the rule **storage and editing UI only** — the validator and
  auto-scheduler are later phases ([#32]).
- **Ordering of a service type's required teams** — the "Teams required" list on
  the add/edit service type screen can be reordered, and a plan shows its teams
  in that order ([#31]).
- **Skills & eligibility** — each position a team member can fill now carries a
  **proficiency level** (Qualified or Trainee). On the team page, tap a member's
  position pill to toggle the level, and each position shows an "eligible people"
  summary with a trainee count; levels also show (and can be toggled) on the
  person's profile. The scheduling picker flags trainees among the people set up
  for a position. This is the data foundation for future auto-scheduling
  ([#30]).
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
- **"Search the web" links on songs** — the song detail page has quick
  **Lyrics** (Google), **Chords** (Ultimate Guitar) and **Listen** (YouTube)
  buttons, and the New Song dialog has a lyrics-search link, each opening a
  pre-filled search in a new tab. No results are pulled into the app and no
  lyrics are stored ([#22]).
- **Media frame on a plan** with a **Lyrics Sheet** — the plan screen now has a
  Media card (between Times and Attachments) showing a formatted lyrics sheet
  for the songs in the order of service: each song's title, the Key/BPM/Meter
  from its Default arrangement, then its lyrics. It follows the setlist order
  and updates automatically when the setlist is reordered ([#25]).
- **Print button on the Lyrics Sheet** — the Media frame can export the lyrics
  sheet as a **two-column PDF**, laid out to flow song-by-song down each column
  and across pages. The file is named
  `LyricsSheet-<ServiceName>-<YYYYMMDD>.pdf` ([#26]).
- **Song arrangements** — a song can now hold multiple **arrangements** in a
  tabbed section on its page, each with its own **Key**, **BPM** and a new
  **Meter** field. Every song has a **Default** arrangement (created
  automatically, can't be deleted); leaders can add, rename and remove the
  others. **CCLI** now sits beside the author at the song level, outside the
  arrangements. Plans and plan-publish emails use the Default arrangement's
  key/BPM (a per-plan key override still wins) ([#24]).

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

### Fixed
- Plan-publish emails now include each song's **Meter** (from its Default
  arrangement) alongside the key and BPM; previously the meter was omitted
  ([#29]).

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
- Migration `20260615090000_song_arrangements` (#24) adds the
  `song_arrangements` table and **backfills one "Default" arrangement per
  existing song from its current `default_key`/`bpm`, then drops those two
  columns from `songs`** (CCLI stays). A trigger auto-creates the Default
  arrangement for every new song, and the Default can't be deleted. The upgrade
  is automatic via `supabase db push`; no manual data steps and no links change.
  **Redeploy the `send-plan-notification` Edge Function** with this migration —
  it now reads key/BPM from the Default arrangement.
- The Meter-in-publish-email fix (#29) is **code-only — no schema change**; it
  ships by redeploying the `send-plan-notification` Edge Function.
- Migration `20260615100000_position_proficiency` (#30) adds a
  `proficiency_level` enum (`trainee`, `qualified`) and a `proficiency` column on
  `team_member_positions`, defaulting existing rows to `qualified`. It applies
  automatically via `supabase db push`; no manual data steps, no new RLS (the
  column inherits the table's existing admin/leader-write policy), and no emails
  or links change.
- Migration `20260615110000_service_type_team_order` (#31) adds a `sort_order`
  column to `service_type_teams` and **seeds it from each team's global order**
  so existing service types keep their current display order. Applies
  automatically via `supabase db push`; no manual steps.
- Migration `20260615120000_scheduling_rules` (#32) adds the
  `scheduling_status` / `pairing_kind` / `pairing_strength` enums; the
  `person_scheduling_prefs`, `person_recurring_unavailability`,
  `person_pairings` and `team_exclusions` tables (admin/leader-write RLS); and
  `min_count` / `max_count` / `requires_level` / `fill_priority` columns on
  `positions`. One-off unavailability continues to use the existing
  `blockout_dates`. Additive only — applies automatically via
  `supabase db push`; no manual steps and no emails or links change.

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
[#22]: https://github.com/mvmran/lscroster/issues/22
[#24]: https://github.com/mvmran/lscroster/issues/24
[#25]: https://github.com/mvmran/lscroster/issues/25
[#26]: https://github.com/mvmran/lscroster/issues/26
[#29]: https://github.com/mvmran/lscroster/issues/29
[#30]: https://github.com/mvmran/lscroster/issues/30
[#31]: https://github.com/mvmran/lscroster/issues/31
[#32]: https://github.com/mvmran/lscroster/issues/32
[#34]: https://github.com/mvmran/lscroster/issues/34
[#35]: https://github.com/mvmran/lscroster/issues/35
