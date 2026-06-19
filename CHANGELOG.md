# Changelog

All notable changes to LSCRoster are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Reorder a service's songs from the Matrix** — the Matrix now has an **ORDER**
  section at the top showing each service's order of service (headers, songs and
  items with their running start times and keys). Drag the handle on any row to
  reorder that service's items inline, without opening the plan. The redundant
  **Position** label on the grid's first column has been removed ([#79]).
- **Warn before creating a duplicate service** — when you create a plan (single,
  repeated, from a template, or by duplicating an existing one), LSCRoster now
  checks for another service on the **same date whose time overlaps** and asks you
  to confirm before going ahead. It compares the services' actual start/end times,
  so two services on one day at different, non-overlapping times don't trigger a
  warning, while overlapping ones do — even if their start or end differ ([#78]).
- **Bulk actions on the People page** — admins can now select several people at
  once (hover a row's avatar to reveal a tick box, or use the **select-all** box in
  the header) and then **Send invitation** or **Archive member** to all of them in
  one go. A confirmation step shows how many people the action will affect, and
  people it can't apply to (no email, already invited, already archived, or
  yourself) are skipped automatically ([#77]).
- **Archiving disables sign-in** — archiving a person now immediately revokes their
  ability to sign in (their account is locked and any active session ends), and
  reactivating restores it. Their record and history are kept, as before. A
  profile shows **Sign-in disabled** while the person is archived ([#45]).
- **Plan times are saved in templates and copies** — the **Times** card
  (Rehearsal, Service, …) is now carried over when you save a plan as a template,
  create a plan from a template, duplicate a plan, or start from a recent plan.
  Previously every new plan started with an empty Times section ([#73]).
- **Pick several positions when adding someone to a team** — on a person's profile,
  **Add to team** now has a second step listing that team's positions with tick
  boxes, so you can grant all the positions they fill in one go instead of adding
  them one at a time ([#65]).
- **Hide Matrix columns** — each Matrix date column has a small **hide** button;
  hiding a column drops it and pulls the next service in so the same number of
  columns stays on screen. Hidden services show as chips above the grid — click
  one to bring it back ([#68]).
- **View a member from the Matrix** — clicking a **team name** in the Matrix opens
  that team, and a scheduled person's cell menu now has a **View <name>** entry
  that opens their profile ([#74]).
- **Page the Matrix through earlier/later weeks** — the Matrix has **←** and **→**
  buttons that shift the window one service earlier or later, so you can roster
  past the next few weeks (and look back at past ones) without changing how many
  show at once ([#67]).
- **Jump between services from a plan** — a plan now has **Prev**, **Today** and
  **Next** buttons in its header to step through that service type's plans in date
  order; **Today** returns to the next upcoming (or today's) service ([#69]).
- **Set a position's minimum from the plan** — each position in a plan's **People**
  panel now has a small **Min −/+** stepper, so you can change how many people a
  position needs (and clear the understaffed flag) without leaving the plan ([#71]).
- **Reorder service types by dragging** — the **Service types** screen now lets
  you drag a row by its handle to reorder the list (the up/down arrows still
  work), and the order is saved for everyone ([#51]).
- **Update or delete a saved template** — the **Save as template** dialog now has
  a dropdown of the existing templates for that service type. Pick one to
  **overwrite** it with the current order of service (the button switches to
  **Update template**), type a new name to create a fresh one, or use the bin
  beside a template to **delete** it ([#61]).
- **Member names on a plan link to their profile** — clicking a scheduled
  person's name in a plan's **People** panel now opens their people page, the
  same as on a team's page ([#62]).
- **Forgot-password flow** — the sign-in page now has a **Forgot password?** link.
  It opens a request page that always shows the same neutral confirmation ("If an
  account exists for that email, we've sent a reset link") so it can't be used to
  probe which addresses are registered. The reset email goes through our own
  Resend pipeline (branded, logged to the email log), and the link lands on a
  **/reset-password** page where the member sets a new password and is signed in.
  Expired or invalid links show a friendly message with a path back to sign in
  ([#39]).
- **Church logo** — Settings → Church now takes a **light-** and a **dark-theme**
  logo (each tile labels itself until an image is set, like a member avatar). The
  logo shows in the app header and on the sign-in page, switching variant with the
  theme; upload only one and it's used for both ([#58]).
- **Block-out dates & activity summary on a profile** — the **Schedules** card now
  lists each service's **positions** (in service-type order) and links each row to
  the plan, adds a **Block out dates** section, and an **Activity summary** strip:
  services this month / this year, top two positions, a serving streak ("3
  consecutive Sundays"), and — for admins and leaders — how the person's serving
  load compares with the team ([#56]).
- **Pending status on People** — people without sign-in access yet now show a
  **Pending** status (and a new **Pending** filter), making it easy to see who
  still needs an email invite after a bulk CSV import ([#43]).
- **Matrix services-shown control** — the Matrix has a **Columns** slider to change
  how many upcoming services it shows side by side (default 4, between 2 and 9), saved
  on that device for that login ([#57]).
- **Jump back to now in the Matrix** — the Matrix week pager now has a **Now** button
  between the **←** and **→** arrows that returns the window to the next upcoming
  service, and the two control groups (**Weeks** and **Columns**) are labelled and
  spaced apart.
- **Assignment status bar on a profile** — the person **Schedules** card now shows
  a red/yellow/green bar above the **Past** list summarising the member's
  **upcoming** assignments across all services (published and unpublished): red =
  requests not yet emailed, yellow = emailed but not yet confirmed, green =
  confirmed, each segment sized by its share of the total. Hovering a segment
  shows its count, e.g. "2 confirmed assignments" ([#55]).
- **Schedules on the person page** — a profile now shows the services a person is
  scheduled onto, split into **Past** and **Upcoming**. A dropdown beside the
  "Schedules" title trims the past list: **Last 1 month** (default), **Last 3
  months**, or **Last 6 services**; upcoming always shows everything. On large
  screens the page is a two-column layout with Schedules alongside the existing
  detail cards ([#52]).
- **Accept part of a roster suggestion** — the "Suggest roster" preview now has a
  checkbox on each suggested assignment and a **Select all / Deselect all** toggle,
  so you can accept only some of the auto-scheduler's picks. Everything starts
  ticked; "Add to plan" inserts just the ticked ones ([#47]).
- **Team order in the Matrix** — the Matrix now lists team sections in the same
  order a plan uses. Filtered to one service type, it follows that type's
  required-team order ([#31]); in **All service types**, each person can set
  their **own** order from a new **Reorder teams** popup — drag a team by its
  handle (desktop) or use the up/down arrows. The order is saved on that device
  for that login only and doesn't affect anyone else ([#33], [#49]).
- **Replace with ranked suggestions & decline re-suggest** — every scheduled
  person now has a **Replace…** action that lists the best available substitutes
  for that spot (top one flagged **Suggested**), each with a short reason and how
  many times they're already serving this month, so you can swap with the
  roster's balance in view. When someone **declines** a request, **Find
  replacement** opens the same ranked list (showing their decline reason), so the
  next-best person is one click away ([#36], [#37]; part of [#32]). The
  accept/decline-by-email loop itself is unchanged.
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
- **Team scheduling rules (cross-team exclusions)** — the **Scheduling rules**
  button on the Teams page and the "two teams can't share a person" rule it managed
  have been removed entirely. Per-position requirements inside a team (minimum and
  maximum count, required level, fill priority) are unchanged ([#76]).
- The per-team **team-leader designation** added for [#2] has been removed
  ([#10]). Assigning multiple positions to a member (#1) is unaffected.

### Changed
- **Confirm before removing a team membership** — removing someone from a team now
  asks for confirmation first, both from the **Teams** screen (removing a member
  from a team) and from a person's profile (removing them from a team), so an
  accidental click no longer drops the membership ([#64], [#66]).
- **Repeat a new plan up to a date** — the **New plan** dialog's *Repeat* control is
  now a date picker: leave it blank for a single plan, or pick a future date and a
  weekly plan is created through to it (the date must be later than the plan date)
  ([#72]).
- **Matrix team order for a single service type** — when the Matrix shows only one
  service type (filtered to it, or because only one type is in view), teams are
  ordered by that service type's setup order and the **Reorder teams** button —
  which only governs the mixed "all types" personal order — is hidden ([#70]).
- **Teams required can be dragged to reorder** — the "Teams required" list on the
  add/edit service type screen gained a drag handle alongside the existing up/down
  arrows ([#50]).
- **Phone numbers** are now validated and tidied: a number entered as an
  Australian mobile is stored and shown as `04xx xxx xxx`, and an international
  number (typed with a leading `+`) as `+cc nnn nnn nnn`. The same formatting is
  applied on the People list, the profile, and CSV import ([#42]).
- **Sidebar & header** — the church name and logo moved from the side menu up into
  the top header; the side menu is now narrower (sized to fit its items), has a
  drop shadow, and its items line up with the page heading ([#54]).
- The person **Schedules** card now reads **date — service type** for each listed
  service, and its "Past" / "Upcoming" headings now match the other card titles
  ([#55]).
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
- An admin can no longer **demote their own role** away from admin — the role
  selector is locked on your own profile ("Another admin must change your role"),
  and the database rejects it outright, so an instance can never be left without
  an admin through the UI. An admin can still change other people's roles ([#44]).
- **Stronger password rules** when setting a password (first-run setup, accepting
  an invite, resetting a password): at least 8 characters, with both upper- and
  lower-case letters, and common passwords are rejected ([#60]).
- Adding or editing a person with an email another person already uses now shows
  a friendly **"A person with this email already exists."** instead of the raw
  database constraint error ([#38]).
- Plan-publish emails now include each song's **Meter** (from its Default
  arrangement) alongside the key and BPM; previously the meter was omitted
  ([#29]).

### Migration / upgrade notes
- Migration `20260619140000_drop_team_exclusions` (#76) **drops the
  `team_exclusions` table** (and its RLS policies). The feature is gone; the only
  data lost is cross-team exclusion pairs. Re-runnable (`drop table if exists`).
  Apply with `supabase db push` **before** `git push`, then regenerate
  `database.ts` types. #77 (bulk People actions) is **code-only — no schema
  change**, reusing the existing `invite` function and people-update RLS.
- Migration `20260619100000_account_access_guards` adds two database triggers on
  `people`: one blocks an admin from demoting their own role (#44), the other
  bans the auth account and drops live sessions when a person is archived, and
  unbans on reactivate (#45). It **backfills** the ban for anyone already archived
  before the upgrade. Re-runnable on a fresh DB. Apply with `supabase db push`
  **before** `git push`.
- Migration `20260619100100_plan_template_times` (#73) adds the
  `plan_template_times` table (leader/admin-write RLS, mirroring
  `plan_template_items`). No data migration; existing templates simply have no
  saved times until re-saved. Apply with `supabase db push` **before** `git push`.
  After pushing, regenerate `database.ts` types.
- Issues #64, #65, #66, #68 and #74 are **code-only — no schema change** — UI on
  the People, Teams and Matrix screens reusing existing membership/position
  mutations and their RLS. Ship by `git push` → Vercel.
- Issues #67, #69, #70, #71 and #72 are **code-only — no schema change**. #71
  edits the existing `positions.min_count` column (covered by its existing
  admin/leader-write RLS); the rest are UI-only. Ship by `git push` → Vercel.
- Issues #50, #51, #61 and #62 are **code-only — no schema change**. They reuse
  existing tables (`service_types.sort_order`, `plan_templates` /
  `plan_template_items`) and their existing admin/leader-write RLS; ship by
  redeploying the static bundle (`git push` → Vercel).
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
- Migration `20260618090000_church_logo` (#58) adds a nullable
  `church_settings.logo_dark_url` column and a **public** `church-logo` storage
  bucket (world-readable so the logo can show on the pre-auth sign-in page;
  writes are admin-only). Additive only — applies automatically via
  `supabase db push`; no manual data steps and no links change.
- The forgot-password flow (#39) adds a new **`request-password-reset` Edge
  Function** (no schema change). Deploy it with `supabase functions deploy
  request-password-reset` (it already has `verify_jwt = false` in
  `config.toml`); it reuses the existing `RESEND_API_KEY` / `EMAIL_FROM` /
  `APP_URL` secrets. **One manual prod step:** add
  `https://lscroster.xyz/reset-password` to the Supabase project's **Auth → URL
  Configuration → Redirect URLs**, or recovery links will fall back to the site
  root instead of the reset page.

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
[#36]: https://github.com/mvmran/lscroster/issues/36
[#37]: https://github.com/mvmran/lscroster/issues/37
[#33]: https://github.com/mvmran/lscroster/issues/33
[#49]: https://github.com/mvmran/lscroster/issues/49
[#47]: https://github.com/mvmran/lscroster/issues/47
[#38]: https://github.com/mvmran/lscroster/issues/38
[#39]: https://github.com/mvmran/lscroster/issues/39
[#42]: https://github.com/mvmran/lscroster/issues/42
[#43]: https://github.com/mvmran/lscroster/issues/43
[#52]: https://github.com/mvmran/lscroster/issues/52
[#54]: https://github.com/mvmran/lscroster/issues/54
[#55]: https://github.com/mvmran/lscroster/issues/55
[#56]: https://github.com/mvmran/lscroster/issues/56
[#57]: https://github.com/mvmran/lscroster/issues/57
[#58]: https://github.com/mvmran/lscroster/issues/58
[#50]: https://github.com/mvmran/lscroster/issues/50
[#51]: https://github.com/mvmran/lscroster/issues/51
[#61]: https://github.com/mvmran/lscroster/issues/61
[#62]: https://github.com/mvmran/lscroster/issues/62
[#67]: https://github.com/mvmran/lscroster/issues/67
[#69]: https://github.com/mvmran/lscroster/issues/69
[#70]: https://github.com/mvmran/lscroster/issues/70
[#71]: https://github.com/mvmran/lscroster/issues/71
[#72]: https://github.com/mvmran/lscroster/issues/72
[#64]: https://github.com/mvmran/lscroster/issues/64
[#65]: https://github.com/mvmran/lscroster/issues/65
[#66]: https://github.com/mvmran/lscroster/issues/66
[#68]: https://github.com/mvmran/lscroster/issues/68
[#74]: https://github.com/mvmran/lscroster/issues/74
[#44]: https://github.com/mvmran/lscroster/issues/44
[#45]: https://github.com/mvmran/lscroster/issues/45
[#60]: https://github.com/mvmran/lscroster/issues/60
[#73]: https://github.com/mvmran/lscroster/issues/73
[#76]: https://github.com/mvmran/lscroster/issues/76
[#77]: https://github.com/mvmran/lscroster/issues/77
[#78]: https://github.com/mvmran/lscroster/issues/78
[#79]: https://github.com/mvmran/lscroster/issues/79
