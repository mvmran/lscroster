# PHASES.md — LSCRoster Build Plan

Solo developer, vibe-coded with Claude Code. Each phase ends with a **usable release**
deployed to the live Life Sanctuary Church instance. Tick boxes as work completes.
**Phases 0–4 are deployed to production.** Phase 3's real-user parallel run
continues alongside. Two Phase-4 acceptance items remain open: (a) the worship
pastor rosters a month in one sitting via the matrix view on prod, and (b) a
call on whether to chase the Lighthouse performance target (production mobile:
accessibility 98 ✓, performance 64). The perf gap is dominated by simulated
slow-4G + 4× CPU throttling against an SPA shell — on real connections first
paint is sub-second; closing it would need vendor-chunk tuning, deferred fonts
and a pre-rendered shell. Don't chase without Manoj's call.

Since launch, work is **issue-driven** against the GitHub backlog
(`mvmran/lscroster`) — see "Post-Phase-4 enhancements" below. **Phase 5
(distribution) has not started; needs Manoj's confirmation.**

---

## Post-Phase-4 enhancements (GitHub issues)

Tracked as issues in `mvmran/lscroster` and shipped one at a time
(implement → verify locally → confirm → `supabase db push` then `git push`
→ auto-close). Newest commits sit on top of the Phase-4 work.

**Done & deployed:**
- **#1** — a team member can fill multiple positions (`team_member_positions`
  join table; multi-select on the team page).
- **#5** — left nav order: Home, My Schedule, People, Teams, Services, Songs,
  Settings.
- **#8** — pastel pink→blue gradient chrome in light mode (white content area;
  dark mode unchanged).
- **#11** — service types gained frequency, days of week, start/end time and
  required teams (`service_frequency` enum, `days_of_week` + `end_time` columns,
  `service_type_teams` join).
- **#12** — the scheduling picker highlights members set up for the position
  being filled ("Set up for this position" group); anyone is still selectable.
- **#13** — a team can serve **multiple** service types. Rather than a new join
  table, this reuses the `service_type_teams` join from #11 (the same
  teams↔service-types relationship): the single nullable `teams.service_type_id`
  FK was backfilled into the join and dropped. A team with no rows serves all
  service types (preserving the old `null` default). The team editor and the
  service-type "required teams" picker are now two views of one table. The
  join's write policy widened from admin-only to admin-or-leader.
- **#14** — the scheduling double-booking warning now fires only when the two
  services' times overlap, not merely the same day. The same-day query carries
  each plan's service-type start/end time and a `timesOverlap` helper compares
  them (a service with no end time is a point — two such services only clash on
  an exact start match; same-plan slots always clash).
- **#15** — a per-person "Send email" action on a plan (re)sends the request
  email to one person. `send-requests` no longer restricts an explicit
  assignment id to pending, so a confirmed person can be re-sent the request.
- **#16** — removing a **confirmed** person reads "Remove and Notify" and fires
  a cancellation email via the new `cancel-assignment` Edge Function (which
  deletes server-side); removing a non-confirmed person stays a plain client
  "Remove".
- **#17** — publishing a plan emails everyone scheduled on it (non-declined,
  one email per person) a full summary via the new `send-plan-notification`
  Edge Function: service/date/time/duration, all plan times, church name +
  address, teams & members grouped, order of service, and songs with key & BPM.
  Added a nullable `church_settings.address` column and an editable Church card
  in Settings (admin only, matching the admin-only RLS).
- **#18** — bulk email sends use Resend's **Batch API** (≤100 emails/request)
  and every Resend call is **rate-limited to under 2 requests/second**. The
  shared `_shared/resend.ts` gained `rateLimit()` (applied to all sends) and
  `sendEmailBatch()`; `send-requests`, `send-plan-notification` and `reminders`
  prepare their emails (token mint / idempotency stamp) then send in one batch,
  preserving per-email `email_log` rows. Code-only, no schema change.
- **#21** — the **matrix view** now matches #16: removing a **confirmed**
  person from a cell reads "Remove and Notify" and sends a cancellation email
  via the existing `cancel-assignment` Edge Function; others stay a plain
  delete. Frontend-only.
- **#22** — **"search the web" links on songs**: the song detail page has
  Lyrics (Google), Chords (Ultimate Guitar) and Listen (YouTube) buttons, and
  the New Song dialog has a lyrics-search link, each opening a pre-filled search
  in a new tab via a shared `songSearchLinks()` helper. UI-only — no results
  pulled in, no lyrics stored, no schema change.
- **#24** — **song arrangements**: a song holds multiple arrangements in a
  tabbed section, each with its own Key, BPM and a new Meter field. Every song
  has a Default arrangement (auto-created by a trigger, can't be deleted); CCLI
  moved to song level beside the author. New `song_arrangements` table
  (migration 0011) backfilled a Default per song from the old
  `songs.default_key`/`bpm`, which were then dropped. `useSongs`/`useSong`
  flatten the Default's key/BPM back onto the song so plan/list/picker readers
  are unchanged; `send-plan-notification` reads key/BPM from the Default
  arrangement.
- **#25** — **Media frame with a Lyrics Sheet**: a Media card on the plan
  screen (between Times and Attachments) renders a formatted lyrics sheet for
  the songs in the order of service — title, the Key/BPM/Meter from the song's
  Default arrangement, then its lyrics — in setlist order, updating when the
  setlist is reordered. Derived from `plan_items` + `useSongs` via
  `buildLyricsSheet()`; the Default arrangement's meter was added to the
  flattened `Song`. UI-only, no schema change.
- **#26** — **Print the lyrics sheet as a two-column PDF**: a Print button on
  the Media frame exports the sheet via a hand-rolled column-flow layout in
  jsPDF (lazy-loaded), file named `LyricsSheet-<ServiceName>-<YYYYMMDD>.pdf`.
  UI-only.
- **#29** — **Meter in publish emails**: the plan-publish notification now lists
  each song's Meter (from its Default arrangement) beside key/BPM. Code-only,
  redeploy `send-plan-notification`.
- **#30** — **Skills & eligibility (proficiency)**: each `team_member_positions`
  row carries a `proficiency` level (`qualified`/`trainee`, migration 0012 enum).
  Team page shows per-position eligible-people summaries and tap-to-toggle level
  pills on members; the person profile shows/toggles levels; the scheduling
  picker flags trainees. Foundation for the auto-scheduling epic — the engine
  itself is **not** built. We extended the existing join rather than adding the
  spec's separate `position_eligibility` table, to keep one source of truth.
- **#31** — **Order a service type's required teams**: `service_type_teams`
  gains a `sort_order` (migration 0013, seeded from the team's global order); the
  add/edit service-type dialog reorders the required-teams list, and a plan's
  People section orders teams by it (`serviceTypeTeamSort`). Serve-all teams (no
  join rows) fall after the explicitly-ordered ones.
- **#32 (phase 1 of 5)** — **Scheduling rules storage + UI**, the foundation for
  auto-scheduling. Migration 0014 adds `person_scheduling_prefs`,
  `person_recurring_unavailability`, `person_pairings`, `team_exclusions` and
  position requirement columns (`min_count`/`max_count`/`requires_level`/
  `fill_priority`); one-off unavailability reuses the existing `blockout_dates`.
  UI: a person-page "Scheduling rules" card (prefs + recurring unavailability +
  serve-with pairings), a Teams-screen team-exclusions dialog, and per-position
  requirement editing on the team page. **No validator and no engine yet** —
  those are spec phases P2–P5 (P2 = shared `validateService` + publish gate is
  the keystone; P3 engine; P4 explainability; P5 confirm/decline email). Kept
  proficiency at two levels (`requires_level` allows `qualified` only).
- **#34 — #32 phase 2 of 5: shared validator + live badges + publish gate.**
  Pure `validateService(state)` in `src/features/scheduling/validate-service.ts`
  (per-rule helpers + a Vitest suite, 22 tests; Vitest added as a devDependency)
  maps the spec's §3 taxonomy onto our schema. Hydrated per plan by
  `usePlanValidation`/`useSchedulingRulesData` (`use-service-state.ts`); live
  red/amber badges on the plan **People** panel and the **Matrix** (understaffed
  → red `+`). Publishing runs a two-tier gate (`publish-gate-dialog.tsx`):
  errors need a typed reason to override, each override logged to the new
  `publish_overrides` table (migration 0015). Decisions: trainees count toward
  `min_count` (TRAINEE_UNSUPERVISED only when a team is all-trainees);
  MULTI_POSITION always hard-errors; `BELOW_REQUIRED_LEVEL` folds into
  `NO_REQUIRED_LEVEL` while proficiency has two levels. **No engine yet** (P3–P5).
- **#35 — #32 phase 3 of 5: auto-scheduler engine → editable draft.** Pure,
  deterministic `autoSchedule(state)` in `auto-scheduler.ts` (11 Vitest tests):
  expands unfilled `min_count` slots, fills scarcest/`fill_priority` first,
  builds each pool from the **hard** constraints (eligibility, required-level
  coverage, availability, active status, no multi-position, team exclusions,
  hard-avoid, and **cadence as hard** per spec Q1), scores by recency/load/
  preferred-pair, and reports unfilled slots with the blocking reason. Hydrated
  by `useAutoScheduler` (`use-auto-scheduler.ts`) over every eligible team member
  (the validator's per-person context maps were extracted in `use-service-state.ts`
  and shared). UI: a **"Suggest roster"** button + preview dialog
  (`auto-schedule-dialog.tsx`) on the plan People panel; Apply writes the
  suggestions as `pending` assignments that flow through P2's badges + gate. No
  new schema.
- **#36 — #32 phase 4 of 5: explainability.** Pure `rankCandidates(state,
  positionId, {exclude})` (3 more engine tests) returns the rule-passing
  substitutes for a slot — score, "why", level, and count-this-month workload —
  evaluated with the replaced person removed. UI: a **Replace…** action on every
  assignment opens a ranked `ReplaceDialog` (`replace-dialog.tsx`), top flagged
  "Suggested", with per-candidate workload so balance is visible while editing.
- **#37 — #32 phase 5 of 5: decline → re-suggest (epic complete).** A declined
  assignment's **Find replacement** now opens the engine-ranked `ReplaceDialog`
  (decline reason shown, best substitute flagged "Suggested"); picking inserts a
  `pending` request. The accept/decline-by-email loop itself is the existing
  Phase-3 flow (`send-requests`/`respond-to-request`/`/respond/:token`) — P5 only
  feeds declines into the engine's suggestions. **#32 epic done; no new schema.**
- **#33 / #49 — Matrix team ordering.** The Matrix now lists team sections in the
  same order a plan uses: a single service-type filter follows the #31 per-type
  order (`serviceTypeTeamSort`); **All service types** uses a personal order saved
  per-login in `localStorage` (`use-matrix-team-order.ts`, pure `applyTeamOrder`).
  A **Reorder teams** popup (`matrix-team-order-dialog.tsx`, All view only)
  supports **drag-and-drop** (dnd-kit, #49) with up/down arrows as a touch/keyboard
  fallback. Client-only — no schema, RLS or migration.
- **#47 — partial accept of a roster suggestion.** The #35 "Suggest roster" preview
  (`auto-schedule-dialog.tsx`) now has a checkbox per suggestion + a select-all
  header (new shadcn `Checkbox` in `components/ui/checkbox.tsx`); "Add N to plan"
  inserts only the ticked picks. Client-only — no schema.
- **#52 — schedules on the person page.** A Schedules card
  (`features/people/person-schedule-card.tsx`) lists a person's Past / Upcoming
  services with a past-period dropdown (Last 1 month / Last 3 months / Last 6
  services); upcoming always shows all. New person-keyed `usePersonSchedule` hook; the
  profile becomes a two-column layout on large screens. Client-only — no schema.
- **#54 — left-menu changes.** The church name + logo (`Brand`) moved from the
  desktop sidebar into the top **header** (kept in the mobile nav sheet); the
  sidebar narrowed `w-60`→`w-48` to fit the longest label, gained `shadow-lg`,
  and its top padding (`pt-[70px]`) aligns the first nav item's text with the
  page heading. Client-only — no schema.
- **#55 — Schedules card formatting.** "Past"/"Upcoming" headings switched from
  `text-lg font-semibold` to the `CardTitle` style; each row now reads
  `date — service type` (deduped per plan, so two services on one day stay
  separate; `usePersonSchedule` gained `service_types(name)`). New **red/yellow/
  green status bar** above Past (`StatusBar` in `person-schedule-card.tsx`)
  summarising the member's **upcoming** assignments — red = pending & not emailed
  (`notified_at` null), yellow = emailed & unconfirmed, green = confirmed — sized
  by share, with native `title` hover counts ("x confirmed assignment(s)").
  `usePersonSchedule` gained `notified_at`. Client-only — no schema.
- **#2 → reverted by #10** — a per-team `is_leader` flag was added then removed.
  Do **not** reintroduce per-team leaders before resolving #6.
- **#38 — friendly duplicate-email error.** `use-people` maps the Postgres
  `23505` violation on `people_email_unique` to "A person with this email already
  exists." in create + update. Client-only.
- **#42 — phone validation + formatting.** `features/people/phone-utils.ts`
  (`formatPhone` / `isValidPhone`, Vitest): AU mobile → `04xx xxx xxx`, intl
  (leading `+`) → `+cc nnn nnn nnn`. Form validates via Zod + formats on blur;
  list / profile / CSV import display through `formatPhone`. Client-only.
- **#43 — Pending status on People.** `person-utils` `accountStatus()`
  (active / pending / inactive from `status` + `auth_user_id`). People list shows a
  **Pending** badge + filter option; profile shows a "Pending invite" badge.
  Display-only, client-only.
- **#56 — Schedules card overhaul.** Italic headings + a "(upcoming assignments
  status)" caption under the status bar; each row lists the **positions** served
  (in service-type order) and links to the plan; a **Block out dates** section
  (`usePersonBlockouts`, past hidden); an **Activity summary** (services this
  month / year, top-2 positions, serving streak, and — for admins/leaders — a
  team-relative percentile). `usePersonSchedule` extended; new
  `useRosterWorkload(enabled)`; pure `describeStreak` / `workloadPercentile`
  (Vitest). Client-only.
- **#57 — Matrix services-shown control.** `use-matrix-plan-count.ts` (per-login
  localStorage, default 4, clamp 2–9) drives a **Columns** slider
  (`components/ui/slider.tsx`); replaces the old fixed `MATRIX_PLAN_COUNT`.
  The week pager also has a **Now** button (resets `weekOffset` to 0) between the
  ← / → arrows, with labelled+spaced **Weeks**/**Columns** groups. Client-only.
- **#58 — church logo.** Migration `20260618090000_church_logo`: nullable
  `church_settings.logo_dark_url` + a **public** `church-logo` bucket (anon read,
  admin write). Upload UI in Settings → Church (light + dark tiles); `<ChurchLogo>`
  shows the theme-appropriate variant in the header brand and on the
  sign-in / forgot / reset cards, falling back to the church icon.
- **#64 / #66 — confirm removing a team membership.** An `AlertDialog` now gates
  membership removal on both the person profile (`person-teams-card.tsx`,
  `membershipToRemove`) and the team page (`team-page.tsx` `MembersCard`,
  `memberToRemove`); the X button opens the confirm instead of mutating directly.
  Client-only — no schema.
- **#65 — multi-position add to a team.** The person profile's **Add to team** flow
  is now a two-step `AddToTeamDialog` (`person-teams-card.tsx`): pick a team, then
  tick its positions (`usePositions(teamId)` + shadcn `Checkbox`); confirm runs
  `add.mutateAsync` then `addPosition.mutateAsync` per ticked position. Client-only.
- **#68 — collapse Matrix columns.** An **EyeOff** button per date header adds the
  plan to a `collapsedIds` set; the visible window is computed by the pure
  `fillMatrixWindow(plans, startIndex, count, collapsedIds)` (`matrix-utils.ts`,
  Vitest, 6 tests) which skips collapsed plans and pulls the next in to keep the
  column count. Hidden services show as **Eye** restore chips above the grid;
  collapses reset on filter change. Client-only — no schema.
- **#74 — Matrix links.** The team-section name links to `/teams/:id` and each
  assignment's cell menu gained a **View <name>** item linking to `/people/:id`
  (`matrix-page.tsx`). Client-only — no schema.
- **#67 — Matrix week paging.** A `weekOffset` state + **←/→** buttons window the
  Matrix over *all* filtered plans (past + future) sorted ascending, defaulting to
  the next-upcoming plan (`todayISODate`); arrows step one service and clamp at
  the ends. Replaces the old `splitUpcomingPast(...).slice(0, planCount)`.
  Client-only — no schema.
- **#69 — prev/next/today on a plan.** The plan header gained **Prev/Today/Next**
  buttons that navigate this service type's plans in date order (`usePlans`
  filtered + sorted; **Today** = first plan with `date >= today`, else latest).
  Client-only — no schema.
- **#70 — Matrix single-type team order.** New `displayedTypeId` (explicit filter
  *or* the sole `service_type_id` in the visible window) drives team ordering:
  single type → `serviceTypeTeamSort` (the #31 setup order); mixed → the personal
  `applyTeamOrder`. The **Reorder teams** button now shows only when
  `!displayedTypeId` — fixing the single-service-type church case where the
  toolbar stayed in "all" mode. Client-only — no schema.
- **#71 — inline position min_count on a plan.** A `PositionMinCount` **Min −/+**
  stepper beside each position in the scheduling panel edits the global
  `positions.min_count` via new `useUpdatePositionMinCount` (optimistic on the
  `['positions']` cache, so the value + understaffed badge update instantly).
  Client-only — no schema (reuses the column's admin/leader RLS).
- **#72 — repeat a new plan to a date.** The New-plan dialog's *Repeat* count
  dropdown became a **repeat-until date** picker; pure `weeklyDates(start, end)`
  (in `service-utils.ts`, Vitest, 6 tests) generates the weekly dates, and the
  dialog validates the date is later than the plan date. Client-only — no schema.
- **#50 — drag-reorder "Teams required".** The add/edit service-type dialog's
  required-teams list gained a dnd-kit drag handle (new `SortableRequiredTeam`)
  beside the existing #31 up/down arrows; order is still local until save. Mirrors
  the Matrix reorder idiom (#33/#49). Client-only — no schema.
- **#51 — drag-reorder the Service types list.** The Service types index is now a
  dnd-kit sortable list (`SortableServiceTypeCard` + grip handle; arrows kept).
  New `useReorderServiceTypes` bulk mutation writes each row's `sort_order` to its
  index with an optimistic cache update (mirrors `useReorderPlanItems`); replaces
  the old neighbour-swap `useReorderServiceType` (removed). Reuses existing
  `service_types.sort_order` + RLS — no schema.
- **#61 — template update/delete on save.** The **Save as template** dialog
  (`SaveTemplateDialog` in `plan-page.tsx`) gained a dropdown of the service
  type's existing templates: picking one (or typing its exact name) flips the
  action to **Update template** (`useUpdateTemplate` — renames + replaces the
  template's items wholesale), a fresh name still creates, and a bin per row
  deletes via the existing `useDeleteTemplate` behind an `AlertDialog` confirm.
  Create/update is derived from a case-insensitive name match, not separate state.
  Reuses `plan_templates`/`plan_template_items` + RLS — no schema.
- **#62 — member names on a plan link to their profile.** The scheduling panel's
  assigned-person name is now a `<Link to={/people/:id}>` (hover underline),
  replicating the team-page behaviour. Client-only — no schema.
- **#39 — forgot-password flow.** New `request-password-reset` Edge Function
  (`verify_jwt = false`, enumeration-safe; `generateLink` recovery → Resend via
  `_shared/email-templates/password-reset.ts` → `email_log`). `/forgot-password`
  (neutral confirmation) + `/reset-password` (recovery-session detection →
  `updateUser`). **Manual prod step:** add `https://lscroster.xyz/reset-password`
  to Supabase **Auth → URL Configuration → Redirect URLs**.
- **#44 — block admin self-demotion.** Migration `20260619100000_account_access_guards`
  adds `prevent_self_admin_demotion()` (BEFORE UPDATE trigger) that raises when the
  caller changes *their own* row's role away from admin (service role / direct DB
  bypass). UI: `PersonForm` gained a `roleLocked` prop (locks the Select + shows
  "Another admin must change your role"); `person-page` passes `isAdmin && isSelf`
  and drops `role` from a self-update payload. Verified by JWT-claim psql probes
  (self → blocked, other-admin → allowed, member edit → unaffected).
- **#45 — archived members lose sign-on.** Same migration adds
  `sync_signin_with_status()` (AFTER UPDATE trigger): status→inactive bans the auth
  account (`banned_until = 'infinity'`) and deletes live `auth.sessions`;
  status→active clears the ban. Backfills existing archived people on upgrade.
  `person-page` shows **Sign-in disabled** + an explanatory note while inactive.
  Verified via psql probe (ban set + session dropped on archive, cleared on
  reactivate).
- **#60 — password rules.** New `features/auth/password-utils.ts`: shared
  `passwordField` / `passwordWithConfirm` Zod schema (min 8, requires upper+lower,
  rejects a common-password blocklist) + `PASSWORD_HINT`, used by the setup wizard,
  invite-acceptance, and reset-password forms. Vitest (`password-utils.test.ts`).
  Supabase Auth's own policy is the server-side backstop.
- **#73 — plan times in templates & copies.** Migration `20260619100100_plan_template_times`
  adds the `plan_template_times` table (leader/admin RLS, mirrors
  `plan_template_items`). `use-plan-templates` save/update now replace template
  times (from the plan's current Times via `usePlanTimes` in `SaveTemplateDialog`);
  `useCreatePlan` copies times into the new plan from either source —
  `fetchSourceTimes` reads `plan_template_times` (template) or `plan_times` (plan),
  so Duplicate, "copy a recent plan", and template-based creation all carry times.
  Member-JWT probe confirmed members can't write `plan_template_times`.

- **#76 — remove team exclusions.** Migration `20260619140000_drop_team_exclusions`
  drops the `team_exclusions` table. Deleted `team-exclusions-dialog.tsx` + the
  **Scheduling rules** button on `teams-page.tsx`; stripped `useTeamExclusions`/
  `useTeamExclusionMutations` + the key from `use-scheduling-rules.ts`, the
  `exclusions`/`teamExclusions` field from `use-service-state`/`use-auto-scheduler`,
  `checkTeamExclusions` + `TEAM_EXCLUSION` + the CHECKS entry from
  `validate-service.ts`, and the exclusion branch + `'exclusion'` reason from
  `auto-scheduler.ts`. Tests trimmed. Per-position requirements untouched.
- **#77 — bulk actions on People.** Admin-only selection on the desktop People
  table: a header **select-all** box + a per-row box revealed on avatar hover (or
  when selected); a toolbar (Select **Send invitation**/**Archive member** + **Go**
  + **Clear**) appears once ≥1 is picked; **Go** opens an `AlertDialog` confirm.
  Pure `partitionBulk`/`bulkSkipReason`/`bulkConfirmQuestion` in `bulk-utils.ts`
  (Vitest) decide eligibility (invite needs email + no login + not archived;
  archive skips self + already-archived). Runs sequentially via the existing
  `useSendInvite` / `useUpdatePerson`. Client-only — no schema.
- **#78 — warn before a duplicate service.** New `findClashingPlans` +
  `ClashCandidate` in `service-utils.ts` (Vitest) reuse the #14 `timesOverlap`
  helper to find existing plans on the same date whose service-type start/end
  window overlaps the new one. A shared `PlanClashDialog` (soft "Create anyway"
  confirm) gates creation in the New-plan dialog (single/repeat/template/copy)
  and the plan page's Duplicate dialog. Client-only — no schema.
- **#79 — ORDER section in the Matrix.** A new top section lists each plan's
  order of service (running times via `computeItemTimes`, headers), each row
  draggable via the existing `useReorderPlanItems` (one `DndContext` per column;
  grips gated on admin/leader). Removed the grid's "Position" label, and the
  Matrix opts out of the layout's `max-w-5xl` (full width up to the sidebar) via
  a `useLocation` check in `app/layout.tsx`. Client-only — no schema.
- **#83 — misc UI polish batch.** Plan header (`plan-page.tsx`): **Prev/Now/Next**
  moved out of the absolutely-centred wrapper into a right-aligned group sharing one
  `flex-wrap items-center justify-end` row with **Draft/Publish/…** (`gap-x-6`
  between the two groups, `gap-y-2` when it wraps on narrow screens); "Today"
  renamed "Now". Matrix cell (`matrix-page.tsx`): the assignment is now a `div`
  (not a `DropdownMenuTrigger` button) holding a name `<Link to=/people/:id>` plus a
  separate **…** trigger button (`ml-auto`, inherits the cell's `text-xs`) that opens
  the menu; the **View &lt;name&gt;** `DropdownMenuItem` (and the now-unused
  `UserRound` import) were removed. Back links on `person-page.tsx` and
  `team-page.tsx` became **← Back** buttons calling `navigate(-1)`
  (`window.history.length > 1 ? navigate(-1) : navigate('/people'|'/teams')`),
  dropping the person page's `focusId` nav-state and its now-unused `Link` import.
  Person page **Archive** wrapped in an `AlertDialog` confirm mirroring Delete
  (Reactivate stays a direct action). Client-only — no schema.
- **#84 — Matrix cell menu parity with the plan.** `matrix-page.tsx`'s `MatrixCell`
  gained `useSendRequests(plan.id)` + a `sendOne(assignmentId)` (mirrors
  `scheduling-panel.tsx`, `sendRequests.mutate([id])`). The cell popup now renders
  **Replace…** for non-declined assignments (reusing the existing `onReplace` →
  AssignPersonDialog replace flow; declined keeps **Find replacement**) and **Send
  email** when `assignment.status !== 'declined' && assignment.people.email`. Remove
  / Remove and Notify switched from the `X` icon to `Trash2`; added `Repeat`/
  `UserPlus`/`Mail` icons to the new items; the **…** trigger is `font-bold`.
  Client-only — no schema. (The query already selects `people(*)`, so email is
  present.)

- **#85 — notify people removed before they confirm.** The plan and Matrix cell
  menus now show **Replace…** only while an assignment is `pending` (a confirmed
  person is swapped via **Remove and Notify**, so they're told). Anyone already
  emailed — `confirmed`, or `pending` with `notified_at` set — reads **Remove and
  Notify** instead of a silent **Remove**, and replacing them routes the old
  assignment's deletion through `cancel-assignment` (new `notifyOld` flag on
  `useReplaceAssignment`, threaded via `ReplaceTarget.wasNotified` /
  `PickerTarget.replaceWasNotified`). The `cancel-assignment` Edge Function now
  emails when `confirmed || (pending && notified_at)`, not just confirmed.
- **#87 — per-person email preferences.** New `person_email_prefs` table (migration
  0020; one row per person, all flags default true, RLS = self **or** leader/admin,
  plus the managing member via #89). A **Email preferences** card
  (`person-email-prefs-card.tsx`, `use-email-prefs.ts`) sits after Scheduling rules
  with four checkboxes (`roster_emails`/`nudge_emails`/`reminder_emails`/
  `publish_emails`), each saving on toggle. The four scheduling email functions
  consult a shared `_shared/email-prefs.ts` (`fetchEmailPrefs`/`prefAllows`,
  missing row ⇒ all on) and skip an opted-out person.
- **#88 — scheduled-job settings.** Migration 0020 relaxes
  `church_settings.request_nudge_days` to 0–14 (default 3) and
  `reminder_days_before` to 0–7 (default 1, clamping any higher existing value),
  and adds `notify_on_publish boolean default true`. New admin-only **Scheduled
  jobs** card (`scheduled-jobs-card.tsx`): nudge days, reminder days, and the
  publish-email switch. `reminders` skips the nudge / reminder pass entirely when
  its day count is 0; `send-plan-notification` returns early when
  `notify_on_publish` is false.
- **#89 — manage an account for someone without email.** Migration 0021 adds
  `people.managed_by_person_id` + `managed_accepted_at`, a `manages_person()`
  security-definer helper, and policies giving a manager **self-level** access to
  the people they manage (people view/update, blockouts, plan_assignments
  respond, email prefs, photo folder) — the column guards (`protect_people_columns`
  extended to cover the two new columns; `protect_assignment_columns`) keep it
  out of admin territory. `accountStatus` treats a confirmed managed account as
  active, pending otherwise. UI: **InviteControls** reworked with an *"assign to
  an existing member"* link → `ManageAccountDialog` (active members with a login),
  a manager chip with detach confirm, and a managed **Send invitation**. The
  `invite` function emails the manager (new `managedInvitationEmail`, privacy
  note); `accept-invitation` gained a managed branch (no password, stamps
  `managed_accepted_at`); the accept page renders a confirm-only `ManagedConfirm`.
  Scheduling emails route a person with no email to their manager via
  `resolveRecipient`, with an "on behalf of" banner.
- **#91/#92/#93 — account-access notices + managed-account fixes.** No schema
  change. New `account-access` Edge Function: archive/reactivate/clear-email,
  emailing the person their sign-in was **revoked**/**reinstated** (new
  `_shared/email-templates/account-access.ts`; logged to `email_log` as
  `access-revoked`/`access-reinstated`). **#91** — Reactivate now confirms (matches
  Archive); the Account & access card names the people a signed-in person manages
  (*"…manages Sam Lee."*, `usePeopleManagedBy`). **#92** — removing the email of an
  account with a login warns first, then deletes the auth user so the record reverts
  to a fresh **Pending** state, notifying the old address. **#93** — managed people
  no longer show stale Resend/Revoke once accepted; **Send email** appears for them
  in the Matrix/Plan menus; scheduling emails routed to a manager name the managed
  person (not "you") in subject and body. Affected functions to redeploy:
  `account-access` (new), `send-requests`, `reminders`, `cancel-assignment`.

**Open backlog (not started):**
- **#3** — investigate scheduling preferences on people.
- **#4** — investigate more detail on the Teams screen.
- **#6** — define what "Team Leader" should actually do (gates whether #2 returns).
- **#7** — review keyboard shortcuts throughout the app.
- **#9** — add a rehearsal workflow.

**Schema since Phase 4:** migrations 0006–0021 in `supabase/migrations/`
(`team_member_positions`; drop `team_members.is_leader`; service-type
scheduling fields + `service_type_teams`; backfill+drop `teams.service_type_id`
onto that join; add `church_settings.address`; add `song_arrangements` +
backfill Default per song + drop `songs.default_key`/`bpm`; add
`proficiency_level` enum + `team_member_positions.proficiency`;
`service_type_teams.sort_order`; scheduling-rules tables + position requirement
columns; `publish_overrides` audit table; `church_settings.logo_dark_url` + the
public `church-logo` bucket; `account_access_guards` self-demotion +
archive-sign-in triggers; `plan_template_times` table; drop `team_exclusions`;
`plans.start_time`/`plan_templates.start_time`; (0020) `person_email_prefs` +
`church_settings.notify_on_publish` + relaxed nudge/reminder ranges; (0021)
`people.managed_by_person_id`/`managed_accepted_at` + `manages_person()` /
`manages_photo_folder()` helpers + manager RLS policies). New Edge Functions:
`cancel-assignment`, `send-plan-notification`, `request-password-reset`; new
shared `_shared/email-prefs.ts` (per-person opt-outs + managed-account routing).
Regenerate `src/types/database.ts` from the local stack after pulling.

---

## Phase 0 — Foundation & deployment pipeline

**Goal:** an empty but deployed, sign-in-able app. Prove the whole pipeline (GitHub → CI →
Vercel, Supabase migrations) before writing features.

### Deliverables
- [x] GitHub repo `lscroster` with MIT licence, README stub, `.gitignore`, `.env.example`
- [x] Vite + React + TS (strict) scaffold; Tailwind + shadcn/ui installed; base theme (light/dark)
- [x] App shell: responsive sidebar/topbar layout, route placeholders for People / Services / My Schedule / Settings
- [x] Supabase project (Sydney region) created and linked; local stack runs via `supabase start`
- [x] Migration 0001: `church_settings` (single row: name, logo_url, timezone, email_from_name), `people` (with `role app_role`, nullable `auth_user_id`), `updated_at` trigger, RLS on both
- [x] Supabase Auth configured: email+password, public signups **disabled**
- [x] Sign-in page, session handling, protected routes, sign-out
- [x] First-run setup wizard: if `church_settings` empty → create church + first admin (bootstrap path for new instances)
- [x] `send-email` Edge Function wrapping Resend + one test template; secrets set
- [x] GitHub Actions: lint, typecheck, build on PR; Vercel connected to `main`
- [x] `npm run db:types` generating `src/types/database.ts`

### Acceptance criteria
- Fresh clone + SETUP steps → working instance in under 30 minutes (note actual time; this is the distribution benchmark).
- Manoj can sign in as admin on the production URL from his phone.
- A test email lands in an inbox via the Edge Function.

---

## Phase 1 — People module

**Goal:** the church directory and the permission system everything else hangs off.

### Data model
- `people` (exists from Phase 0): first/last name, email, phone, photo_url, birthday (optional), status (`active|inactive`), role, notes
- `invitations`: person_id, token, expires_at, accepted_at

### Deliverables
- [x] People list: search, filter by status/role/team, sort; fast on 200+ records; mobile-friendly cards _(team filter arrives with teams in Phase 3)_
- [x] Person profile page: details, photo upload (Supabase Storage, private bucket, signed URLs), edit
- [x] Create person (no login required — a person is just a record until invited)
- [x] Invite flow: admin sends invitation email → person sets password → `auth_user_id` linked; resend/revoke invitations
- [x] CSV import with column mapping, preview and duplicate detection (match on email)
- [x] Roles & permissions enforced end-to-end: RLS policies + UI gating for admin/leader/member
- [x] Members can edit their own contact details and photo
- [x] Settings → Users page: change roles, deactivate people
- [x] Soft-archive (status `inactive`) instead of delete; hard delete admin-only with confirmation

### Acceptance criteria
- Real LSC congregation imported via CSV.
- A member-level account can see the directory appropriately but cannot edit others or reach admin pages (verified at the API level, not just hidden buttons).
- An invited person can go from email → signed in on a phone in under 2 minutes.

---

## Phase 2 — Services planning core

**Goal:** replicate the heart of Planning Center Services: service types, dated plans, a
drag-and-drop order of service, and a song library.

### Data model
- `service_types`: name, default_start_time, sort_order
- `plans`: service_type_id, date, title (optional), status (`draft|published`), notes
- `plan_items`: plan_id, sort_order, kind (`header|song|item`), title, song_id (nullable), key_override, length_seconds, description
- `songs`: title, author, ccli_number, tags[], lyrics/chord text (optional), status (key/bpm moved to `song_arrangements` in #24)
- `song_arrangements`: song_id, name, song_key, bpm, meter, is_default, sort_order (#24)
- `song_attachments`: song_id, storage_path, label (chart, mp3, etc.)
- `plan_templates` + `plan_template_items`

### Deliverables
- [x] Service types CRUD (Settings)
- [x] Plans index: upcoming/past per service type, create plan for a date, duplicate a previous plan
- [x] Plan page: order of service with dnd-kit reordering; add header/song/item; per-item length; running clock with computed start times from service start
- [x] Song library: CRUD, search by title/author/CCLI, tags, default key; per-plan key override
- [x] Song attachments: upload/download via Storage (private bucket, signed URLs)
- [x] "Last scheduled" shown on songs (avoid repeating songs week to week)
- [x] Plan templates: save plan as template, create plan from template
- [x] Draft vs published: members only see published plans
- [x] Print-friendly run sheet view (clean CSS print stylesheet)

### Acceptance criteria
- A full LSC Sunday service can be planned start-to-finish, reordered by drag, and printed as a run sheet.
- Times auto-recalculate correctly when items are reordered or resized.
- Leaders can do all of the above; members see published plans read-only.

---

## Phase 3 — Scheduling, rostering & email

**Goal:** the rostering engine — the reason the app exists. Teams, positions, requests,
blockouts, and email accept/decline.

### Data model
- `teams`: name, service_type_id (nullable = all), sort_order
- `positions`: team_id, name, sort_order
- `team_members`: team_id, person_id; fillable positions via `team_member_positions`
- `plan_assignments`: plan_id, person_id, team_id, position_id, status (`pending|confirmed|declined`), token, responded_at, notified_at
- `blockout_dates`: person_id, start_date, end_date, reason (optional)

### Deliverables
- [x] Teams & positions CRUD; manage team membership from team page and from person profile
- [x] Scheduling panel on the plan page: schedule people into positions; warn on blockout conflicts and double-booking the same person on the same date
- [x] Blockouts: members add their own; leaders see them when scheduling; calendar-style picker
- [x] Scheduling request emails (Resend): plan details + **Accept / Decline** buttons using signed single-use token links — no login required
- [x] `respond-to-request` Edge Function: validates token, updates status, shows a friendly confirmation page; decline asks for an optional reason
- [x] In-app responses too: **My Schedule** page listing pending requests and upcoming confirmed dates
- [x] Status visible at a glance on the plan (pending/confirmed/declined colour coding); one-click "find replacement" re-request flow
- [x] Reminder emails via pg_cron → Edge Function: nudge unanswered requests (e.g. after 3 days) and remind confirmed people a configurable number of days before the service
- [x] Email log table for troubleshooting delivery

### Acceptance criteria
- End-to-end on real users: leader schedules a team → members get emails → accept/decline from a phone without logging in → plan updates live.
- Blockout conflicts are impossible to miss when scheduling.
- Reminder emails fire correctly in the church timezone.
- **This phase makes the app daily-driver ready for LSC. Run it in parallel with the old process for 2–4 weeks before switching over.**

---

## Phase 4 — Polish & power features

**Goal:** quality-of-life features that make it feel like a mature product.

### Deliverables
- [x] Matrix view: weeks × positions grid across upcoming plans, with inline scheduling
- [x] Recurring plan creation (e.g. generate next 8 Sundays from a template)
- [x] Multiple times per plan (rehearsal + service times) shown in emails and My Schedule
- [x] Plan attachments (files on plans, not just songs)
- [x] Dashboard/home: this week's plan, my pending requests, my upcoming dates
- [x] PDF export of run sheet
- [x] Song usage reports (frequency, last played, by service type)
- [x] Performance pass: route code-splitting, query caching review, image sizes; instant-feel navigation _(initial bundle 1,085 kB → 381 kB; pages lazy-load; jsPDF only loads on demand)_
- [x] Mobile UX pass on the top flows; PWA manifest + icons (installable; positions the codebase for the future native apps)
- [x] Accessibility pass (keyboard, focus states, contrast) _(dialog descriptions added; Lighthouse accessibility 98)_

### Acceptance criteria
- Worship pastor can roster a month in one sitting via the matrix view.
- Lighthouse: 90+ performance and accessibility on key pages.

---

## Phase 5 — Distribution to other churches

**Goal:** any reasonably technical person at another church can stand up their own instance.

### Deliverables
- [ ] `docs/SETUP.md`: step-by-step — fork repo → create Supabase project → run migrations (`supabase db push`) → set secrets → deploy to Vercel → first-run wizard. Include screenshots.
- [ ] "Deploy with Vercel" button in README
- [ ] Seed script with demo data (sample service type, songs, team) for evaluation, plus a wipe-demo-data command
- [ ] `docs/UPGRADE.md`: pull latest → `supabase db push` → redeploy; versioned releases (git tags) + `CHANGELOG.md`
- [ ] Branding configurable per instance: church name, logo, colour accent, email sender — all via Settings, no code edits
- [ ] Resend setup guide including custom domain/DNS for good email deliverability
- [ ] Backup guidance (Supabase backups; manual `pg_dump` instructions)
- [ ] README: screenshots, feature list, comparison scope vs Planning Center, licence (MIT)
- [ ] Dry run: deploy a second clean instance from the docs alone, timing it; fix every friction point found

### Acceptance criteria
- A second, fully independent instance deployed using only the documentation, in under an hour, with zero code changes.

---

## Out of scope (for now — keep the codebase ready, but do not build)

- Native Android/iPhone apps (future separate project; PWA covers the gap)
- Check-ins, Giving, Groups, Registrations (other Planning Center modules)
- SMS notifications, CCLI reporting integration, ProPresenter/streaming integrations
- Multi-tenant SaaS hosting

## Cost guardrails (~50 users)

Supabase free tier, Vercel Hobby and Resend free tier (3,000 emails/month) comfortably cover
launch scale. Revisit only if storage (song attachments) or email volume grows; first paid
step would likely be Supabase Pro for daily backups.
