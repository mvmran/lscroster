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
- **#2 → reverted by #10** — a per-team `is_leader` flag was added then removed.
  Do **not** reintroduce per-team leaders before resolving #6.

**Open backlog (not started):**
- **#3** — investigate scheduling preferences on people.
- **#4** — investigate more detail on the Teams screen.
- **#6** — define what "Team Leader" should actually do (gates whether #2 returns).
- **#7** — review keyboard shortcuts throughout the app.
- **#9** — add a rehearsal workflow.

**Schema since Phase 4:** migrations 0006–0015 in `supabase/migrations/`
(`team_member_positions`; drop `team_members.is_leader`; service-type
scheduling fields + `service_type_teams`; backfill+drop `teams.service_type_id`
onto that join; add `church_settings.address`; add `song_arrangements` +
backfill Default per song + drop `songs.default_key`/`bpm`; add
`proficiency_level` enum + `team_member_positions.proficiency`;
`service_type_teams.sort_order`; scheduling-rules tables + position requirement
columns; `publish_overrides` audit table). New Edge Functions:
`cancel-assignment`, `send-plan-notification`. Regenerate
`src/types/database.ts` from the local stack after pulling.

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
