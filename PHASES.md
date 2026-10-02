# PHASES.md — LSCroster Build Plan

Solo developer, vibe-coded with Claude Code. Each phase ends with a **usable release**
deployed to the live Life Sanctuary Church instance. Tick boxes as work completes.
**Phases 0–5 are complete and deployed to production.** Phase 3's real-user
parallel run continues alongside. Phase 4's acceptance items are both closed:
the worship pastor rosters a month in one sitting via the matrix view on prod,
and the Lighthouse criterion is met on accessibility (98) and **deliberately not
pursued on performance** (production mobile 64). the user's call, 2026-08-21: that
score is Lighthouse's simulated slow-4G + 4× CPU profile against an SPA shell,
not what the congregation experiences on real phones. Reopening it would mean a
pre-rendered shell, getting the Supabase client off the sign-in path and
`manualChunks` tuning — don't start any of that without asking him again.

Since launch, work is **issue-driven** against the GitHub backlog
(`mvmran/lscroster`) — see "Post-Phase-4 enhancements" below. **Phase 5
(distribution) completed 2026-08-21** and shipped as **v1.0.0**: docs,
screenshots, demo data, per-instance branding, and a second-instance dry run
that stood up a genuinely independent church in 36 minutes with zero code
changes.

---

## Access control rework (2026-09-23 →)

Came out of a full map of the permission model on 2026-09-23, taken in the order
the user chose: **1** the role name, **2** BAU permissions, **3** the Team
Leader/Viewer merge. **1 and 2 shipped 2026-09-27** (`ad9989c`, migrations 0044
and 0045); **3 shipped 2026-09-29** (0048), along with the coordinator/rule-mute
fixes (0047) and the two directory leaks (0046). All applied to production
(1 admin, 6 coordinators, 25 members) and merged to `main` (`66700fb`). Only two
"Found while mapping" items remain open below (the plan-attachments storage leak
and the admin-blockout UI gap), plus the deferred "See contact details & notes"
permission. Not yet cut as a release — currently unreleased on `main` past
**v1.0.4** (2026-09-27, `0782a4e`).

**How it worked before** (context for the decisions):
- Global role `people.role` = `admin` | `leader` | `member`. `leader` is
  **global**, not per team — `is_admin_or_leader()` never looks at teams.
- Per-team grants `team_leaders` / `team_viewers` (0023) can go to anyone,
  including a plain member. Only **rostering** is team-scoped
  (`can_manage_team()`): a team's positions, members, plan assignments, per-plan
  min counts, and the `send-requests` / `cancel-assignment` functions.
- A global leader holds four kinds of power, not one:
  1. **content** — plans, order of service, templates, publish, songs, service
     types, set-list email;
  2. **structure and access** — create/delete teams, appoint Team Leaders and
     Viewers on any team **including themselves**, conditional rules, pairings,
     scheduling prefs;
  3. **personal data** — everyone's email, phone and birthday, admin notes,
     archived people, everyone's blockouts and email prefs;
  4. **outbound email** — publishing emails the whole roster; the set list.
- Yet a global leader **cannot roster** without a Team Leader grant, while a
  member who is a Team Leader can. "Leader" and "Team Leader" read backwards.

### 1. The global role is now **Coordinator** — shipped 2026-09-27 (`9879623`, 0044)
- [x] Full rename: `alter type app_role rename value 'leader' to 'coordinator'`
  in place (every leader is a coordinator, nothing to backfill);
  `is_admin_or_leader()` → `is_admin_or_coordinator()` (policies and the
  people_directory view follow by oid; `can_view_contact` and
  `protect_assignment_columns` redefined because they call it by name); 26
  policies renamed "Leaders …" → "Coordinators …". The two on `storage.objects`
  keep "Leaders manage plan/song attachment files" — renaming a policy needs
  ownership of the table, which the migration role lacks there; they are labels
  only and already call the new function. Frontend, 5 Edge Functions, demo seed
  and docs follow. Behaviour unchanged.
- [x] Names rejected: **Editor** (describes only the content power and hides the
  governance and personal-data reach — an admin could hand it to the song
  librarian without realising it shows every phone number and birthday) and
  **Manager** (managed accounts, 0021, already say "managing member" and
  "Account managed by Jane" — a Manager badge beside that means something
  unrelated). Moderator/Supervisor also passed over.
- [x] No coordinator power moved to admin-only (the user, 2026-09-23).
- **Upgrade note (0044):** "Leader" reads "Coordinator" everywhere, same people,
  same powers. `db push` and `functions deploy` before the bundle; coordinators
  lose their edit buttons only for the minute between.
- **Resolved (2026-09-29, 0047):** coordinators now manage and roster **every**
  team church-wide — `can_manage_team()` widened to `is_admin_or_coordinator()`,
  with the client and Edge Function checks to match.

### 2. BAU permissions for members — shipped 2026-09-27 (`4dce22a`…`ad9989c`, 0045)
The gap: named members need specific day-to-day jobs without a global role.
- [x] Six permissions (`app_permission`), granted per person
  (`person_permissions`), checked by `has_permission()` in RLS and
  `callerHasPermission()` in Edge Functions, `usePermissions()` in the app:
  `edit_order_of_service`, `publish_plans` (+ set-list email),
  `create_delete_plans` (+ plan templates; **implies** editing the order, since
  creating from a template writes it), `manage_songs` (+ AI helpers),
  `attach_plan_files`, `view_all_plans` (every plan's lyrics sheet, drafts
  included).
- [x] **Admins and coordinators hold every permission implicitly** (the user chose
  this over grant-only: no backfill, no behaviour change, and self-granting
  made grant-only an audit trail rather than a restriction). A limited person is
  a member with grants.
- [x] **Coordinator-only, never grantable:** granting permissions, appointing
  Team Leaders/Viewers, creating/deleting teams. Service types, conditional
  rules, pairings and scheduling prefs also stay with the role.
- [x] Any plan permission lets a member **see every plan**, drafts included
  (`can_see_all_plans()`) — an editor must open the draft they edit. Draft
  rosters stay private. Column guards: a publisher may change only
  `plans.status` and `plan_items.lyrics_id` (how publishing pins lyrics);
  an order editor anything but the status.
- [x] Church-wide scope only (a service-type column can come later).
- [x] **Permission templates** are presets: applying copies, so editing or
  deleting a template changes nobody. Person page → Permissions (Apply
  template…, Save as template…); Settings → Permission templates.
- [x] **Deletion safety** (Settings, admins): `allow_person_delete` /
  `allow_song_delete` on `church_settings`, default on; enforced by RLS and the
  `delete-person` function. Archive remains the safe path.
- [x] Grants audited (`person.permission_add` / `_remove`).
- [x] Fixed on the way: creating a plan from a template with per-position
  minimums failed for a coordinator who leads no team; the Matrix's Bulk email
  was offered to non-Team-Leaders (the server always refused/skipped them) —
  it now shows only a viewer's own teams.
- [x] Person page: Scheduling rules, Email preferences and Notes stack under
  Schedules on wide screens (after the right column on a phone).
- Verified: CI, a 60-check API probe (one throwaway member per permission), 21
  browser checks, and the user's own run-through as Ava (coordinator) and Caleb
  (member + Media Team Leader).
- [x] **Shipped `d87721a`** (2026-09-28, on `main` as `212f419`): plain-lyrics
  songs no longer render greyed out; `LyricsReadView` renders every song the
  same way and shows layer toggles only when a song has layers.
- [ ] **Deferred, last:** a grantable "See contact details & notes" permission
  (the user, 2026-09-23 — revisit after everything else).
- **Upgrade note (0045):** nobody's access changes. `functions deploy` is
  required (five functions changed their gates and `_shared/auth.ts` gained
  `callerHasPermission`).

### 3. Team Leader + Team Viewer merged — shipped 2026-09-29 (0048)
- [x] One **Team Access** card instead of two, on both the team page
  (`team-grants-card.tsx` → `TeamAccessCard`) and the person page
  (`person-team-grants-card.tsx` → `PersonTeamAccessCard`), with a per-team
  level dropdown.
- [x] One table — `team_grants(team_id, person_id, access)` (enum
  `team_access`) replaced `team_leaders` + `team_viewers`. Data migrated
  (Leader→Manager, Viewer→Viewer, both→Manager); helpers, RLS, audit trigger,
  `teamScopeFor` and the digest recipients all re-pointed.
- [x] **Decision made:** the grant was split three ways — **Viewer** /
  **Scheduler** / **Manager** (`view` / `roster` + email / full). Manage
  (membership, positions) = Manager only; schedule (assignments, targets,
  rule-mutes, email) = Scheduler+. Decisions: schedulers see contact (D1);
  schedulers set per-plan min counts (D2); every grant level gets the digest
  (D3); label "Manager" not "Leader" (D4). See docs/DESIGN-team-access-merge.md.
- **Upgrade note (0048):** grants preserved; `db push` + `functions deploy`
  (send-requests, cancel-assignment, reminders) before the bundle. Applied to
  production 2026-09-29.

### Found while mapping — fix independently of 1–3
- [x] **Fixed (0046):** `people.notes` no longer readable by any signed-in
  user — masked in `people_directory` to `is_admin_or_coordinator()`, base-column
  SELECT revoked, dropped from `PERSON_SAFE_COLUMNS`. DB-probed.
- [x] **Fixed (0046):** `person_scheduling_prefs`, `person_pairings` and
  `person_recurring_unavailability` SELECT tightened to
  `is_admin_or_coordinator() or schedules_any_team()` (was `using(true)`). DB-probed.
- [ ] Leak, smaller: the `plan-attachments` bucket is readable by any signed-in
  user with no plan-visibility check, so a draft plan's files are readable by
  path. **Deferred — blocked:** tightening it means dropping the permissive
  SELECT policy on `storage.objects`, which the migration role can't drop/alter.
  Needs a privileged step or an Edge-Function signed-URL path (decide approach).
- [x] **Fixed (0047):** coordinators now satisfy `can_manage_team()`, so the
  person-page team-membership editing they were offered now succeeds.
- [x] **Fixed (0047/0048):** `plan_rule_mutes` management widened to
  `is_admin_or_coordinator() or schedules_team_on_plan()`, so a team's
  schedulers/managers can mute and coordinators can too — UI and RLS now agree.
- [x] **Done:** removed the orphaned `/settings/users` screen (role change and
  archive/reactivate live on the person page); repointed `docs/SETUP.md`.
- [x] **Done:** `/services/matrix` now has a `RequireMatrixAccess` route guard
  mirroring `canMatrix`.
- [ ] Minor, deferred: admins can manage anyone's blockouts per RLS, but the UI
  only offers self and managed people — unexposed capability, not a bug.
- [x] CLAUDE.md "Database conventions" described `leader` as team-scoped — fixed
  2026-09-27 with the coordinator wording.

---

## Backups (2026-09-28)

The Supabase free plan takes no backups. Shipped to `main` (`e176559`,
`83db5be`); not in a release yet — the next release row should mention it (no
action needed by instances: scripts and docs only).
- [x] `scripts/backup.sh [dest]` — roles, schema, data (`public` + `auth`,
  password hashes included) and every storage file into one dated
  `.tar.gz` with a manifest (row/file counts, migration, secret *names*,
  sha256). Verifies people rows and file counts, fails loudly, keeps the
  newest 30 (`KEEP=`). Archive mode 600 in a 700 folder.
- [x] `scripts/restore.sh <archive> <db-url>` — into an **empty** project only
  (refuses if `people` has rows); public + `auth.users`/`auth.identities` in
  one transaction (the rest of `auth` is version-bound and fails on a newer
  project); files back via `storage cp` to `ss:///`. psql from the Supabase
  Postgres image, so nothing to install.
- [x] `docs/BACKUPS.md` rewritten: Pro vs free, cron line, manual commands,
  restore steps (Session pooler URL), yearly drill on a second local stack.
- [x] Drilled 2026-09-28 on a throwaway local stack (ports 553xx): counts
  matched the manifest, a restored login signed in.
- [x] Flint: user crontab, **02:30 nightly**, into `~/dev/backups/lscroster`
  (the script default since 2026-09-29, `d859696` — the cron runs no-arg). Runs
  from the main checkout, so it must stay linked with `node_modules` installed;
  token from `~/.supabase-token`. Not a Syncthing folder — keep it that way.
- [x] **Off-flint copy.** Handled by the user's existing backup setup outside
  this repo (confirmed 2026-09-29) — archives no longer live only on flint's one
  disk. (Mechanism not recorded here; Supabase Pro daily backups remain an option
  if the roster later needs point-in-time restore.)
- [ ] Glance at `~/dev/backups/lscroster/backup.log` now and then — every
  good night ends with a `wrote …` line.
- [ ] Next restore drill: **2027-09** (docs/BACKUPS.md, "Worth doing once a
  year").

---

## Post-Phase-4 enhancements (GitHub issues)

Tracked as issues in `mvmran/lscroster` and shipped one at a time
(implement → verify locally → confirm → `supabase db push` then `git push`
→ auto-close). Newest commits sit on top of the Phase-4 work.

**Gotchas worth remembering:**
- **shadcn `Checkbox` / radix nested-interactive:** pair a Checkbox (or a
  `DropdownMenuItem`'s sibling button) with a sibling `<label htmlFor>` — do
  **not** nest the radix button inside the label; the label re-forwards the
  click and cancels the toggle.
- **shadcn `Card` has no `forwardRef`** — for dnd, wrap it in a
  `<div ref={…}>`, don't pass `ref` to `Card`.
- **`tailwind-merge` drops `bg-primary` when a `bg-gradient-to-*` class is also
  present** — it classes the legacy v3 gradient name as a background *color*
  conflict and keeps only the gradient, leaving the element transparent. Use
  Tailwind v4's canonical `bg-linear-to-*` (and `bg-radial`/`bg-conic`) so a
  solid `bg-*` and a gradient sheen coexist (bit the primary button in the 3D
  depth pass).
- **`detectSessionInUrl` runs only at client init** — the reset-password page
  needs a full page load with the recovery hash present; changing only the
  hash on the same path won't trigger it.
- **Optimistic position edits:** validation reads positions from the
  `['positions']` query (`useAllPositions`); invalidating that prefix also
  refreshes `['positions', teamId]`.
- **The People list renders twice** (mobile cards `md:hidden` + desktop table
  `hidden md:block`), so a plain `id` per person is ambiguous when scrolling
  to a row — use a `data-person-row` attribute and pick the variant whose
  `offsetParent !== null`.
- **Scroll-on-navigation vs scroll-into-view race:** a layout-level
  `window.scrollTo(0,0)` on pathname change must depend **only on
  `pathname`** and skip when nav state carries a target to scroll to —
  otherwise clearing that state re-fires the effect and snaps back to the top.
- **Plan People-panel visibility is client-gated on top of RLS** (issue #105):
  `scheduling-panel.tsx` `visibleTeams` + per-team `visiblePositions` decide what
  a viewer sees, but RLS is the real boundary. A manager sees their managed
  people's teams because `assignedTeamIds` now includes managed person_ids
  (`usePeopleManagedBy`), matching the "Managers view managed assignments" RLS
  policy (migration 0021 — still live, not dropped by 0024). A read-only viewer
  (`!canManageTeam`) only sees positions with ≥1 readable assignment, so
  RLS-hidden rosters on a draft don't render as falsely empty.
- **Local stack can lose table DML grants after `db reset --local`** — some CLI
  versions set the `public` default privileges for the `postgres` owner to only
  `Dxtm` (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN), so `authenticated`/`anon` get NO
  SELECT/INSERT on **any** table (every REST call 401/403, `has_table_privilege`
  false even for `positions`). It's environment-wide, not a migration bug — prod
  grants are fine. Fix locally before probing/driving the UI:
  `grant all on all tables in schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon,
  authenticated, service_role;` (also do sequences). Migrations must NOT add
  grants — that diverges from the rest of the schema and the platform handles it.
- **`aria-label="Remove <name>"` collides** — both the team-page member-remove
  button (#66) and the team-grant remove button (#106) use the same label, so a
  document-wide query hits the member one first; scope to the grant card when
  testing. The Matrix add-cell now also has a sibling "…" menu (#109,
  `aria-label="Cell actions"`) beside the "Schedule someone" "+".
- **Edge Functions aren't observable in the Vite/browser preview** — to
  exercise an email-sending path (invites, account-access, reminders) locally,
  run `npx supabase functions serve --env-file .env.functions.local` alongside
  `npm run dev`.
- **No `useBlocker` — the app uses a declarative `<BrowserRouter>`, not a data
  router**, so React Router's `useBlocker`/`unstable_usePrompt` throw. The
  unsaved-lyrics warning (`useUnsavedChangesWarning`, `src/lib/`) instead pairs a
  `beforeunload` listener (browser refresh/close) with a **capture-phase document
  click interceptor** that catches in-app `<Link>`/`<NavLink>` clicks (rendered
  as `<a href>`) and `window.confirm`s before React Router's bubble-phase handler
  runs — capture is essential (React 18 attaches its listeners to the root
  container, a descendant of `document`). It can't see same-page buttons, so the
  Arrangements card guards **tab switches** (another arrangement) separately by
  lifting the editor's `dirty` flag up. Gaps by design: programmatic `navigate()`
  (e.g. sign-out) and the browser Back button aren't intercepted. Migrating to
  `createBrowserRouter` would let `useBlocker` cover those uniformly — deferred as
  too broad a change for a single editor's guard.

**Local verification quickstart:**
```
npx supabase start                 # Docker Desktop must be up; retry once if it wedges
npx supabase db reset --local      # rebuild from migrations
npx supabase gen types typescript --local > src/types/database.ts   # bash only
npm run build && npm run lint && npm run typecheck && npm test
npm run dev                        # then drive the UI via preview_* tools
```
The local DB has no `seed.sql` — after a reset it's empty (no users, no
`church_settings`, so the app routes to `/setup`). To drive the UI, reseed:
1. Keys: `npx supabase status` (Publishable `sb_publishable_…`, Secret
   `sb_secret_…`).
2. Create a confirmed admin via the GoTrue admin API:
   `curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users` with
   `apikey` + `Authorization: Bearer` = the **secret** key and body
   `{"email":…,"password":…,"email_confirm":true}`; grab the returned `id`.
3. One psql batch: insert a `church_settings` row (else `/setup`), a `people`
   row (role `admin`, `auth_user_id` = that id), and whatever domain data is
   needed. Pipe SQL via
   `MSYS_NO_PATHCONV=1 docker exec -i supabase_db_lscroster psql -U postgres -d postgres < file.sql`
   — Git Bash mangles container paths for `-f` / `docker cp`.

**RLS probe:** seed a member JWT and confirm member writes to new rule tables
→ 403, reads → 200, admin writes → success. Hidden buttons are not security.
- **Append-only audit/log tables that record deletions** must use plain `uuid`
  columns + a snapshotted name label, **not** an FK to `people`: an AFTER DELETE
  trigger inserts the audit row after the referenced row is gone, so an FK would
  violate. The label also keeps the log readable after renames/deletes.
- **Any joined `people` embed can be `null` even when the parent row exists** —
  base `people` RLS only lets non-admins read **active** people, so for a member
  the embedded person comes back `null` for anyone archived. This bites *every*
  query that embeds people, not just one: an archived person still on a published
  plan's roster (`plan_assignments`, seen by members via RLS) **and** an archived
  person still in `team_members`. Dereffing the null (`assignment.people.first_name`,
  or `fullName(m.people)` in the auto-scheduler's name map at
  `buildEngineState`) throws and blanks the whole page (no error boundary, so the
  React root unmounts → white screen). It's member-only (admins/leaders read
  inactive people) and the team-member path fires on the **plan page** the moment
  `AssignPersonDialog` mounts (it calls `useAutoScheduler` → `buildEngineState`
  unconditionally) — so it's independent of any assignment, which is why removing
  the archived person's *assignment* doesn't fix it. Fix once, at each fetch:
  filter null-`people` rows in `useMatrixAssignments`, `usePlanAssignments`,
  `useAllTeamMembers` and `useTeamMembers`. No-op for admins; keeps the non-null
  type honest. Archiving/deleting doesn't remove a person's future assignments or
  team memberships, so the person page + bulk-archive also warn when someone is
  still rostered.

**preview_* tool notes:** `preview_eval` arg is `expression` (no top-level
`await`); `preview_click` needs a CSS `selector` (no `:has-text`/`ref`) —
click a button by text via eval; set a React-controlled input with the
native value setter + `input`/`change` events; a programmatic `/auth` fetch
does **not** log the SPA in, use the sign-in form. Radix `Select` isn't a
native `<select>` — `preview_fill` can't set it; click by text via eval.

**Design system (2026-07-04 modernization, client-only, NO schema):** the
whole theme is parameterised on one `--brand-hue` var in `src/index.css`
(278 = deep indigo; every branded token — primary/ring/accent/sidebar — derives
from it, so re-hueing the app is a one-line edit). The old issue-#8 pastel
pink→blue chrome gradient is gone: a flat near-white tinted sidebar with an
accent-highlighted active nav pill (Linear/Notion style), dark-mode parity
throughout. Four **depth tokens** (`--shadow-raised`/`-btn`/`-well`/`-float`)
give the 3D feel — raised cards/outline buttons (inset white hairline top-lights
edges in dark mode), tactile primary buttons (top-highlight `bg-linear-to-b`
sheen + pressed `active:` state), inset form fields, floating dialogs/menus.
Shared page chrome lives in three new components — `PageHeader`
(title/count/back-link/actions), `EmptyState` (icon/title/hint/action, `card`
vs `plain`) and `StatusBadge` — plus `src/lib/status.ts` (`STATUS_SOFT`/
`STATUS_OUTLINE` = canonical semantic red/amber/green class strings, kept
Tailwind-palette-based, NOT brand-derived); `ASSIGNMENT_STATUS_CLASSES` and the
validation badges now reference them. All ~20 screens adopt `PageHeader`/
`EmptyState`; the print run-sheet + PDF and the public `/respond` page were left
untouched. eslint now ignores `.claude` (stale agent worktrees there broke
`eslint .` with tsconfigRootDir errors).

**Schema since Phase 4:** migrations 0006–0032 in `supabase/migrations/`
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
`manages_photo_folder()` helpers + manager RLS policies; (0022)
`managed_plan_visibility` widens `is_assigned_to_plan()` so a manager sees the
plans their managed people are rostered onto; (0023) `team_access_grants`:
per-team `team_leaders` + `team_viewers` tables with `leads_team()` /
`can_manage_team()` / `views_team()` / `is_viewer_of_plan()` helpers — re-points
the team/position/membership/assignment **write** policies from blanket
`is_admin_or_leader()` to per-team `can_manage_team()`, and extends the
plan/items/times/attachments/assignment **read** policies so Team Viewers get a
read-only view of their teams' rosters incl. drafts). (0025)
`plan_position_min_counts` + `plan_template_position_min_counts` (issue #110):
per-(plan, position) and per-(template, position) **minimum-required overrides**.
The "Min required" steppers now write these instead of the team-wide
`positions.min_count`; the validator/engine read
`coalesce(override, positions.min_count)` via `planMinCountMap()` +
`useAllPlanMinCounts`. Plan write policy is per-team (`can_manage_team(position's
team)`); template policy is `is_admin_or_leader()` (mirrors `plan_template_items`).
(0024) `people_contact_visibility` (issue #119): hides `email`/`phone`/`birthday`
from members who shouldn't see them — `revoke`s SELECT on those three columns
from `authenticated`/`anon` (granting back only the safe columns) and exposes a
masked `people_directory` view (the app's read path) that blanks them per a new
`can_view_contact()` helper (admin/leader · self · manager · Team Leader of the
target's team). A generated `people.has_email` boolean keeps "is this person
emailable?" available to scheduling without exposing the address. (0026)
`team_leader_plan_visibility` — `leads_team_on_plan()` so a Team Leader sees the
plans their team serves. (0028) `roster_status_job` (issue #117):
`church_settings.roster_status_weeks` (0–52, 0 = off) + `person_email_prefs
.roster_status_emails` for the nightly upcoming-roster-status digest.
(0030) `scheduled_job_send_times` (issue #120):
`church_settings.nudge_hour`/`reminder_hour`/`roster_status_hour` (smallint 0–23,
defaults 9/9/20) — admin-set send hour per scheduled job; the `reminders`
function gates each job on its configured hour instead of hard-coded 9am/8pm.
(0031) `leaders_manage_service_types` (issue #125): widens the `service_types`
manage policy from admin-only to `is_admin_or_leader()` (the `service_type_teams`
join was already widened in 0008); UI adds a `RequireAdminOrLeader` route guard
and shows the service-types card to leaders. (0032) `audit_log` (issue #116):
append-only audit trail (admin-read RLS + explicit `grant select to
authenticated`; **no** write grant — rows written solely by security-definer
AFTER-row triggers on `people`/`team_members`/`team_leaders`/`team_viewers`, so
the log is unforgeable). Records when/who/what for person add·archive·reactivate·
delete·role-change and team member/leader/viewer add·remove. `actor_person_id`/
`target_person_id` are plain uuids (no FK) with snapshotted `*_label` so the log
survives renames/deletes and is insertable *during* a person delete. Actor =
`current_actor_person_id()`: browser writes via the JWT person; service-role Edge
Functions pass the caller in an `x-audit-actor` header trusted **only** for
`service_role` (anti-spoof). `serviceClient(actorPersonId?)` injects that header;
`account-access` (archive/reactivate) and `delete-person` pass `caller.id`.
Admin-only Settings → Audit log screen (after Email delivery) with date-range
(default 3 days)/event/person/changed-by filters, 200-row cap. Issue #126
(no schema) gates all scheduling email on a shared `isEmailableActive()` so
pending (not-yet-accepted) and inactive people are never emailed.
(0033) `arrangement_centric_songs` (issue #130): **song_arrangements becomes the
record a plan uses.** New `song_arrangement_songs` junction (arrangement ⇄ songs,
replaces `song_arrangements.song_id`) — a non-default arrangement linked to 2+
songs is a **medley** and appears under every linked song; new versioned
`song_arrangement_lyrics` (replaces `songs.lyrics`; version assigned by trigger,
max+1 per arrangement). `plan_items`/`plan_template_items`/`song_attachments`
re-point `song_id` → `arrangement_id`; `plan_items.lyrics_id` pins the version a
**published** plan uses (`pin_plan_lyrics(plan_id)` on publish, cleared on
unpublish; drafts follow latest; editing a pinned version warns and creates a new
one). `song_usage` rebuilt over the junction + new flat `song_plan_usage` view —
medley plays count for **every** linked song (CCLI). Triggers keep the old
invariants junction-side: Default auto-created with its link, exactly one Default
per song, Default links exactly one song, orphaned arrangements deleted when
their last link goes (song delete cascades this way; shared medleys survive).
Per-song arrangement-name uniqueness is now app-checked (DB constraint went with
`song_id`). UI: per-arrangement lyrics + attachments in the Arrangements card
tabs, a linked-songs control (non-default only) to build medleys (confirm +
append the linked song's latest Default lyrics into the editor), smart two-step
plan song picker (one click when only Default exists), order of service / print
/ lyrics sheet / emails show medley names and arrangement keys.
**Upgrade note (0033):** backfills existing data — every arrangement gets a
junction row to its old song and a v1 copy of the song's lyrics; attachments and
plan/template items move to the song's Default arrangement; items on published
plans are pinned to v1. Storage paths unchanged; no user action needed.
(0034) `worship_setlist` (issue #133) + (0035) `team_types` (issue #134): the
publish-time **worship set-list email**. Schema: `setlist_recipients` (each
row a person **or** a team; admin-write / leader-read RLS),
`church_settings.send_setlist_on_publish` (default **off**),
`song_arrangements.reference_url` (the recording an arrangement follows,
edited on the arrangement card) and `teams.team_type` (enum
general/worship/media, set on the team create/edit dialogs — 'media' reserved
for future comms). Settings → "Scheduled jobs" is renamed **Communications
setup** (`communications-setup-card.tsx`) and gains the set-list toggle +
recipient picker (per-publish email estimate; warns above 20). On publish —
and on demand from the plan's ⋯ menu ("Email set list…") — the
**`send-setlist`** Edge Function builds the email server-side and batch-sends
it. The body *is* the set list, a bordered grid mirroring the worship team's
long-standing Word template (issue #134): Service Information (date, service
type, **worship-type teams' rosters only** as "Name (Position) / …" rows,
theme = plan title), Practice Information (plan times + church address), Song
List (name with the item's flow note beneath / Listen link — **empty** when
the arrangement has no `reference_url`, no search fallback / key / info =
meter / BPM) and Notes (plan.notes verbatim). **No attachment** — a
"Download lyrics sheet (PDF)" button opens the plan with `?lyrics=download`,
which `PlanMediaCard` consumes to auto-generate the existing lyrics-sheet PDF
client-side. Attachment-free means the send-out is one Resend **Batch API**
call (cap 50 recipients), so the publish path's chaining after
plan-notification is belt-and-braces only. Function expands teams → members,
dedupes, requires leader/admin, logs each send to `email_log` (template
`setlist`), and deliberately skips per-person publish-email prefs — the
distribution list is an explicit admin choice. (The first cut, shipped
briefly as 0034 alone, attached a jsPDF set-list PDF and sent individual
rate-limited emails; reworked to the above after reviewing it against the
team's real template.)
New Edge Functions: `cancel-assignment`, `send-plan-notification`,
`request-password-reset`, `run-scheduled-job` (admin "send now" for the
scheduled email jobs); new shared `_shared/email-prefs.ts` (per-person opt-outs
+ managed-account routing) and `_shared/roster-status.ts` (the #117 digest
builder); `_shared/auth.ts` gains `teamScopeFor()` so
`send-requests`/`cancel-assignment` enforce the same per-team boundary as RLS.
The `reminders` function now runs three jobs off the one hourly cron (nudges,
reminders and the roster-status digest, each at its admin-configured hour —
issue #120) and accepts `{ force, only }` so an admin can trigger one on demand.
Regenerate `src/types/database.ts` from the local stack after pulling.
(0036) `projection_api` (issue #135): read-only **Projection API** for the
church's Mac projection software, served by the new **`projection-api`** Edge
Function (`verify_jwt = false`; contract doc `docs/PROJECTION-API.md`,
apiVersion 1). `GET …/plans` lists published plans **today−10…+60 days**
(church timezone); `GET …/plans/{id}/lyrics` returns setlist-ordered songs with
arrangement/key(override-aware)/BPM/meter, the **pinned `lyricsVersion`** +
raw lyrics + parsed `sections[]` (`_shared/lyric-sections.ts`, a Deno port of
the app parser — keep the header grammar in sync), and medley-aware
`sourceSongs[]` (author / CCLI / copyright). Auth = admin-issued keys
(`lscp_` + 64 hex, generated in-browser, **shown once**, sha-256 hash in new
`projection_api_keys`, per-device revocation) from the new Settings →
**Projection API** card; no Supabase key is ever shared. Every request logs to
`projection_api_requests` (60/min/key rate limit → 429 + CCLI usage audit;
both tables admin-only RLS). Schema also adds **`songs.copyright`** (multi-line
CCLI attribution, edited on the song page under CCLI number, served in
`sourceSongs`). Only published, in-window plans are servable — no bulk
historical export. No new env vars/cron.

(0037) `conditional_rules` (issue #113): **conditional relationship rules** —
"if the person in ⟨trigger position⟩ is ⟨male/female⟩, then ⟨target
position(s)⟩ need ⟨N⟩ people" (design doc `docs/DESIGN-conditional-rules.md`).
Schema: `people.sex` (nullable `person_sex` enum; joins the safe-columns
grant + appended to `people_directory`, unmasked — set on the person form),
`conditional_rules` (+ `conditional_rule_effects` child rows, service-type
scoped, `strength` reuses `pairing_strength`) and `plan_rule_mutes`
(per-plan off-switch). Evaluation is the pure resolver
`conditional-rules.ts::resolveRequirements` — **effective min precedence:
manual per-plan override (#110) > fired rules (max wins; hard beats soft on
ties) > team default** — consumed by the validator (`checkCoverage` emits
rule-attributed `CONDITIONAL_MIN_UNFILLED`, severity from rule strength;
`checkConditionalRules` warns `RULE_UNEVALUATED` when a trigger assignee's sex
is unrecorded) and by the engine (fills one slot at a time, re-resolving after
every pick; rule targets sort after their triggers via `rulePositionDepths`;
no-rules behaviour is byte-identical to before). **No ELSE** — the else-case
is a second rule; base min is the "nothing fired" default. Cycles are rejected
at authoring time (named loop message). UI: dropdown sentence builder + rule
list on Teams (admins/leaders), status chips on the plan's People panel
(active / waiting / not applicable / can't check / muted — click to mute per
plan), min-stepper shows rule provenance and a manual step overrides the rule
for that plan. NB: `ValidationPosition.minCount` / `EnginePosition.minCount`
are now the **base** team default; overrides travel separately in
`planMinOverrides` (the resolver coalesces). No new env vars/cron.

(0038) `conditional_rule_person_effects` (issue #113 extension): rules grow
**person-identity conditions** and **person / same-person effects** (design
doc §8). Conditions: `attribute(sex)` | `person(<id>)` | `any`; effects:
`count(≥N)` | `person(<id>)` | `same-person` — mixed freely in one rule
("if WL is Sam → Sam on Guitar, Sharon on Keys, ≥2 Female Vocals").
`any` + `same-person` = the **cross-team mirror** ("whoever leads worship also
runs Foldback" — rules were already position-scoped, so cross-team was free).
Fired person effects emit **personRequirements**: never write-time gates —
the validator flags `CONDITIONAL_PERSON_MISSING` (severity = rule strength,
message notes declined/unavailable), the engine fills the pool-of-one slot
(never substitutes; names the person in unfilled reasons), and the plan page
shows a one-click **"Add ⟨person⟩"** button. Fired requirements **sanction**
those (person, position) pairs: `checkMultiPosition` + the engine's
`in-service` rejection skip exactly them (a third position still errors;
swap the trigger and the sanction evaporates). Fairness counts **once per
service** (history deduped by plan). Request emails stay one-per-row.
Person FKs are `ON DELETE SET NULL` → a null ref makes the rule **broken**
(new status): stops firing, red plan chip, "needs attention" badge + reason
on the rules card (also warns for inactive / no-longer-set-up people).
DB: widened `trigger_attribute` CHECK + `trigger_person_id`;
`effect_kind`/`required_person_id`/nullable `min_count` on effects with
per-kind shape CHECKs and partial unique indexes. Additive only — v1 rows
stay valid. Builder gains the operator select + eligibility-filtered person
pickers. NB: `SaveConditionalRuleVars`/`toConditionalRule` now speak the
unions; `useAllConditionalRules` embeds person names via the two FK hints.
No new env vars/cron.

(0039) `brand_accent` (Phase 5): `church_settings.brand_hue` smallint 0–360,
default 278 — the per-instance accent colour, picked from a swatch grid in
Settings → Church and applied to `--brand-hue` at runtime. Additive and
default-identical, so no instance changes appearance on upgrade.

(0040) `lyrics_layers` **Multi-lingual lyric layers** (issue #139): a song's
lyrics become four parallel texts on the one versioned row —
`song_arrangement_lyrics.lyrics` plus new nullable `lyrics_native`,
`lyrics_meaning`, `lyrics_chords` and `native_language`. Additive with no
backfill, so nothing changes for an existing instance until someone uses it.

**`lyrics` keeps its meaning and its content: the primary singable text in Latin
script.** For a multi-lingual song that is the transliteration; for an English
song it is simply the lyrics. Making the Latin text the default — rather than
the original script — is what keeps every existing reader working untouched: the
lyrics sheet PDF, the setlist email and the projection API all still read
`lyrics` and still emit Latin, so none of them needs a font that can shape
Malayalam. It also keeps chords readable against the line they belong to, which
they are not over Indic conjuncts. (Chords were column-positioned at first,
which forced a monospace face; `v1.0.3` moved them to ChordPro brackets — see
its entry below.)

**The invariant: the base owns the line structure.** Line N of every layer
belongs to line N of `lyrics`; headers and blank lines live in the base and are
blank rows elsewhere. Shorter layers are padded on save (`normalizeForSave`).
This is what lets a section reorder carry a chorus's native text, meaning and
chords along with it — the three section splices moved out of `lyric-sections.ts`
into `lyric-layers.ts` and became **line-range** operations applied identically
to all four texts. `lyric-sections.ts` still owns parsing (base only) and is
unchanged below that.

Working in whole lines dropped the old blank-line separator fix-up too: joining
lines can never glue two sections together the way splicing a chunk that lacked
a trailing newline could. The one case that still needs a blank appended — the
final section landing mid-text — is decided once from the base and applied to
the same chunk in every layer, so all four gain the line together.

**Editor.** Three push-buttons (`Native` / `Meaning` / `Chord`) sit right-aligned
on the field's header row, so they read as "beside the label" closed and "above
the right pane" open — no layout shift either way. Radix `ToggleGroup
type="single"` gives the mutual exclusion, deselect-to-close and keyboard nav for
free; `radix-ui` was already a dependency, so only
`src/components/ui/toggle-group.tsx` was new. The 3D press reuses the existing
depth tokens — resting `shadow-raised`, pressed `shadow-well` + `translate-y-px`.
Split is vertical on desktop, **horizontal on a phone**.

Two mechanics worth remembering — (1) both panes must set `wrap="off"`
(`white-space: pre`): at 50% width each pane wraps at a different point, so a
wrapped line 12 occupies two rows on one side and one on the other and the
line-by-line correspondence is visually gone within a screenful. Verified in the
DOM: both panes `pre`, both `line-height: 24px`, identical top offset. (2) the
structure editor's hidden mirror copies computed styles to measure section
extents, so `white-space` had to join `MIRROR_STYLE_PROPS` or its offsets drift
the moment the split opens. Both panes also carry an explicit `leading-6` —
`text-sm`'s default leading clips Malayalam conjuncts.

Drift is the design's real risk (parallel blobs can separate in a way an inline
annotation could not), so it is made visible rather than prevented: line-number
gutters beside both panes, a "N lines against M" badge, and an "add the missing
blank lines" action. Enter is deliberately *not* intercepted — that would fight
paste and normal editing.

**Readers.** `LyricsReadView` (song page, plan Media card) stacks the layers
around each line with chords **above** it, per-reader toggles defaulting to off,
falling back to plain text when a song has no layers. The lyrics-sheet PDF takes
`meaning` and `chords` (it switched the lyrics to Courier to hold the chord
columns until `v1.0.3` bracketed them). Native script is deliberately **not**
offered in the PDF —
jsPDF's core fonts have no Indic glyphs and even an embedded Noto face does not
form conjuncts or reorder pre-base vowel signs. That gap is why transliteration
is the base layer and not an afterthought.

**Projection API stays `apiVersion: 1`** — purely additive. `lyrics` and
`sections[].lines` keep their exact meaning and content (proven: identical output
when no layers are passed), with a new optional `sections[].layers` whose arrays
are index-parallel to `lines`, plus a top-level `nativeLanguage`. Because
`toApiSections` drops blank lines, it now tracks each kept line's source index so
the layer arrays line up against `lines` rather than against the raw text. Chord
entries are `trimEnd`-ed only — their *leading* spaces are what position a chord
over its syllable. Documented in `docs/PROJECTION-API.md` §6.1.

**Verified locally (2026-08-27):** `db reset --local` with 0040 → demo data →
split editor drives in the browser. Typed Malayalam into the native pane, saved,
confirmed in Postgres (5 base lines / 5 native lines). Moved a section down via
the pill menu and confirmed every layer moved with it and the separator blank
landed at the same index in both. Mobile (375px) stacks with no page overflow.
Plan Media card shows the Native toggle only for the song that has one. 193 unit
tests pass, 23 of them new for `lyric-layers`.

Shipped in **`v1.0.3`** — an instance upgrading to it needs `db push`
(migration 0040) and `functions deploy projection-api` **before** the new bundle
goes live, or the song page queries columns its database does not have.

**Open question, deliberately unresolved:** whether meaning reads better
per-line or per-stanza. Line-parallel storage does both (leave the intervening
rows blank); it only decides what the editor leads with, and it is better
answered after a real Malayalam song has been typed in.

(no migration) **Own-password change + reveal toggle** (issue #138): a Password
card on your own profile — current, new, confirm — plus an eye button on every
password field in the app (sign-in, invitation acceptance, password reset,
first-run setup, and the new card) from the shared
`src/components/password-input.tsx`. Supabase's `updateUser` never asks for the
old password, so the card proves it first with `signInWithPassword`; a wrong
answer errors on the field and leaves the session intact, and the re-auth also
satisfies Supabase's optional "secure password change" setting. The card is
gated on `isSelf && p.auth_user_id`, so an admin cannot set someone else's
password from their profile — invitations and reset links stay the only route.
Client-only: no schema, no function, no env var. Shipped in **`v1.0.3`**.

(no migration) **Hover tooltips across Services, Matrix and Plan**: every button
on those three screens now carries a native `title`, matching the pattern the
files already used. Two mechanics worth remembering — (1) `Button` has
`disabled:pointer-events-none`, so a `title` on a *disabled* button never shows;
where the greyed-out reason is the point (paging bounds, nothing to send, no
service types, no songs) the reason lives on a wrapper
`<span className="inline-flex" title=…>` and the action copy stays on the
button, innermost-hovered wins. The Matrix "Bulk email" hint had been invisible
since it shipped for exactly this reason. (2) With `asChild`, Radix's Slot lets
the child win, so the `title` goes on the inner `<Link>` for
`<Button asChild><Link/></Button>` and on the `<Button>` inside a
`DropdownMenuTrigger asChild`. Also renamed the plan "…" menu's *Save as
template…* to **Templates…** (and the dialog heading to **Templates**) — that
dialog creates, overwrites *and* deletes. Shipped in **`v1.0.3`**.

(no migration) **Plan prev/now/next steps through every plan, not just the same
service type** (bug, reported 2026-08-26): the nav filtered `plansQuery.data` on
`service_type_id`, so opening the Sunday morning plan and pressing Next skipped
straight over that evening's service. It now sorts *all* plans with
`comparePlansByDateTime` (`service-utils.ts`) — date, then effective start time
(per-plan override, else the service type default), then service type name as a
stable tiebreak; an unset start time sorts after the timed ones that day.
The list you came from can still narrow it: the Services list and the Matrix
append their service-type filter to each plan link as `?type=<id>`, the plan
screen scopes the walk to it, and Prev/Now/Next keep it in the URL (and the
`from` state) as you step — so the scoping survives a refresh or a shared link.
A `?type=` that doesn't match the plan you're on is ignored, so a stale or
hand-edited URL can't strand the buttons; "All service types" means no
parameter and a walk across every type. The Services list's own filter now
*lives* in that URL too (`/services?type=<id>`, set with `replace` so it doesn't
pile up history) instead of component state, so opening a plan and coming back —
Back button or browser back — returns to the list you were looking at rather
than resetting to "All"; a type that no longer exists falls back to showing
everything. **The Matrix's type filter is still component state** and resets the
same way; extend it the same way if that becomes annoying. Note the sort must copy the array first
— `plansQuery.data` is the React Query cache. Five unit tests in
`service-utils.test.ts`. Shipped in **`v1.0.3`**.

(no migration) **Lyric layers: two carry-over fixes.** Creating an arrangement
seeded only the base text from the song's Default, leaving native, meaning and
chords blank — `fetchDefaultLyrics` now returns the whole layered row and the
insert copies every column. Separately, saving pinned lyrics **as a new version**
wrote only the four texts, so `native_language` silently reset to null on the
first re-save; the new row now inherits it from the version it supersedes. That
one was invisible in the app and only showed up through the projection API,
which reads `nativeLanguage` off the latest version. Both found in the same
week the layers shipped, which is the argument for using a feature before
trusting it. Shipped in **`v1.0.3`**.

(no migration) **Proportional lyrics and ChordPro chords.** Every lyric surface
— base, native, meaning, chords, in both editor panes and the read view — is now
the proportional body face. Monospace only ever existed to hold a chord over its
syllable by counting spaces, which Indic conjuncts defeat anyway; chords are
marked with ChordPro brackets instead, which carries the placement in any font.
`splitChordLine` (in `lyric-layers.ts`) splits a chord line into its bracketed
chords and the text around them; read views set the chord name bold in the
accent colour and keep the brackets, dimmed, because weight and colour alone run
"[G]Amazing" together as one word. Both conventions work — a bare chord row
(`[G] [C]`) or a full ChordPro line (`[G]Amazing [C]grace`). The lyrics-sheet PDF
follows: no Courier switch, and the chord line is laid out piece by piece so
bracketed chords print bold against the lighter syllables (jsPDF draws one style
per call, so mixed weights need manual measurement). `docs/PROJECTION-API.md`
documents the convention for the Mac app, including the older space-aligned
chords it may still receive.

**Upgrade note:** chord lines typed before this keep their spaces and lose their
alignment — they read as plain text with no bracket to highlight, and want
re-typing with brackets. No data is lost and nothing else changes. Shipped in
**`v1.0.3`**.

(no migration) **The base text must be Latin.** Typing Malayalam straight into
the lyrics pane quietly cost a song both its transliteration and the point of the
layers, so `findNonLatinLyrics` names the first straying line and its characters
in red under the editor, points at the Native button, and the Save button is
disabled until it is fixed (the reason on a wrapper span — a disabled button
never shows its own `title`). Letters and marks outside Latin are caught;
Common and Inherited count as Latin, so digits, punctuation and a combining
accent ("é" as e + U+0301) all pass. It applies to existing songs too: one whose
base already holds native script shows the error and cannot be re-saved until
the text moves to the Native layer. Shipped in **`v1.0.3`**.

(no migration) **Import pasted multi-lingual lyrics** (`lyric-import.ts`,
`lyrics-import-dialog.tsx`): an Import button beside the layer toggle opens a
paste dialog that parses the format the teams already keep their songs in — a
section header, the native script, then `Transliteration` and `Meaning` blocks —
and routes each block to its layer. A section header is repeated at the top of
every layer that has text, so the four texts stay line-parallel and each pane
reads as labelled verses (read views print it once); a song with neither keyword
imports as lyrics alone, which is every English song.
The source format lets a section's three texts differ in length while the
editor's layers are line-parallel, so each section is aligned at its first line
and padded to its tallest text: the next verse starts after all three finish
rather than drifting. Importing **appends** to the editor buffer with a blank row
between, never overwriting, and pads existing layers across the join so native
text imported into a song that had none lands beside its own lines. Nothing is
saved until the user reviews it. A leading title line imports as a lyric line by
design — dropping it would risk eating a real first line of an English song.
11 unit tests. Shipped in **`v1.0.3`**.

(no migration) **Optional AI help around a song** (`generate-meaning`,
`lyrics-assist`). Four things a person would otherwise type by hand: the English
**meaning** of a line drafted from its native script; a **polished
transliteration**, where the model reads both the original script and the
offline romaniser's letter-accurate draft and returns what a singer would
actually write; **suggested tags** read from the lyrics, spelled the way the
church already spells its tags and only ever added to the field; and
**section labels**, which is the one job the offline numberer cannot do —
telling a chorus from a verse needs a reader, and repetition is the signal.

Every one is optional per instance and gated on the same `GEMINI_API_KEY`: with
no key the functions answer `{configured:false}` to a probe that costs no model
call, and none of the buttons render, so a church that doesn't want an AI bill
sees the editor it has always had. The key lives only in the Edge Functions —
that is the whole reason these are functions and not a fetch from the browser —
and both mirror the `is_admin_or_leader()` policy on the lyrics they touch.

Nothing is written to the database: every answer lands in the editor buffer and
is stored when a person presses **Save changes**. The two that *replace* text
rather than fill a blank are held to a higher bar — the meaning draft only ever
fills an empty pane, and the transliteration polish asks twice, the second time
in a dialog that says exactly what is about to change. The server-side alignment
step is what makes them safe to run over a song at all: whatever the model
returns is forced back to one entry per line before it leaves the function, with
the line that went in as the fallback, so a model that miscounts cannot shift a
song's layers out of step or empty a verse. Section labels are validated against
the app's own header grammar and dropped if unrecognised, since they are written
into someone's lyrics as header lines. Where a labeller adds headers they go
into every layer at once (`insertSectionHeaders`), which is the only way to add
a row without pushing every layer beneath it out of step.

`_shared/gemini.ts` holds the one call site: the Interactions API
(`/v1beta/interactions`, `x-goog-api-key`), `thinking_level: 'minimal'`,
structured array-of-strings output. 24 Deno tests over the pure helpers.
**Action needed on upgrade:** `npx supabase functions deploy` before the new
bundle goes live, so `lyrics-assist` exists when the app probes for it. An
instance that skips it simply doesn't see the new buttons — the probe fails
closed.

**Write a transliteration from scratch** (2026-09-23, `37724e0`, no migration).
The polish link used to be withheld when the lyrics pane was blank — exactly the
case (Korean, Arabic, Chinese: scripts the offline romaniser doesn't cover) that
needed it most. It now shows on the Native layer whenever there is a script to
read, and reads **"Write the transliteration for me"** when the lyrics pane is
empty; clearing the pane is how to ask for a fresh one when a draft is too far
gone to correct. The confirm dialog is skipped when there is nothing to
overwrite. In `lyrics-assist`, an all-blank draft switches the prompt to "return
a romanisation" (no per-line draft, no "return it unchanged" rule), and
`alignTransliteration` now answers as tall as the taller of native and draft
(it used to be `draft.map`, which would have cut a whole song down to the one
blank row of a cleared pane); a header row with nothing beside it takes the
native layer's own label, so sections survive. Same-height drafts produce
byte-identical output to before. 3 new Deno tests. `lyrics-assist` deployed to
production before the push.
- [x] **Base-cleared save guard** (2026-09-29): saving is now blocked when the
  lyrics pane is empty but another layer (native / meaning / chords) still has
  text — the native text is kept (`padLayers` never truncates a longer layer)
  but read views are driven by the base, so saving then would leave the song
  showing nothing. `baseMissing` in `song-page.tsx` disables the save button
  with a reason (mirroring the `scriptBlocked` / `chordsNeedKey` guards) and
  `onSaveClick` early-returns. Clearing **every** layer to remove the lyrics is
  still allowed; the guard only fires when text would be orphaned.

(no migration) **AI "suggest the next song"** (2026-10-02): a small Sparkles
button on a plan's "Add a song" box (`song-picker-dialog.tsx`) asks the new
**`suggest-song`** Edge Function for the next song to add — one that sits well
against the keys already on the plan **even without a matching-key arrangement**
(it says so in a key note, e.g. "works in C, transpose from its D arrangement"),
fits how the church has grouped songs before (`song_plan_usage` history), and
keeps the language mix sensible (tags may name a language). Accept adds it via
the ordinary add path (arrangement step if >1); **Reject** remembers it
(localStorage per plan, `use-song-suggest.ts`) so the next press skips it, until
a different plan. Optional per instance exactly like the lyrics helpers
(`GEMINI_API_KEY`; `{probe:true}`→`{configured}`; button hidden when off), but
gated on **`edit_order_of_service`**. Being a reasoning task it uses its own
model — **`GEMINI_SUGGEST_MODEL` (default `gemini-3.5-flash`), thinking level
`medium`** — independent of the lyrics jobs' `GEMINI_MODEL`; `_shared/gemini.ts`
gained `askForObject` + a configurable `askModel` for it. The handler assembles
plan/library/history server-side (capped 300 candidates / 40 history plans) and
`parseSuggestion` rejects a hallucinated or excluded pick (422), so it can only
ever return a real, non-rejected, not-already-on-plan song. Verified end-to-end
against the local stack with a real key (suggest + reject both correct). **No
migration**; `functions deploy suggest-song` before the bundle. Deno tests in
`_shared/song-suggest.test.ts`.

(no migration) **Hover tooltips everywhere else**, finishing the pass that began
on Services/Matrix/Plan: the song page, then People, Scheduling, the rest of
Services, Settings and the app shell — icon-only controls, the People select-all
and row checkboxes, drag handles, switches, and labels whose consequence isn't
obvious (Archive, Revoke, Go). Buttons whose visible text already explains them
were deliberately left alone. One trap worth remembering: the wrapper-span trick
for disabled buttons must **not** be used on a `DropdownMenuTrigger asChild` —
Slot puts the trigger's props on the span, and with the button's pointer events
off the click falls through and opens an empty menu. The layer buttons' "this
layer has text" dot is now the accent colour rather than the button's own text
colour, which had it reading grey until pressed. Shipped in **`v1.0.3`**.

(no migration) **CI runs the test suite.** `npm test` joins lint, typecheck and
build in `.github/workflows/ci.yml`, and the actions are on v5. The repo also
pins line endings (`.gitattributes`, `* text=auto eol=lf`) after a Syncthing
round trip between Windows and Linux produced a 92-file phantom CRLF diff.
Shipped in **`v1.0.3`**.

**Upgrade note (0023 — per-team access grants):** management is no longer
global. After `db push`, an existing global **Leader** keeps governance (create
teams, appoint Team Leaders/Viewers on any team) and broad read, but can no
longer edit a team's positions/members/assignments unless appointed that team's
**Team Leader**. Admins are unaffected. No data migration needed — appoint Team
Leaders via each team's page.

---

## Phase 0 — Foundation & deployment pipeline

**Goal:** an empty but deployed, sign-in-able app. Prove the whole pipeline (GitHub → CI →
Vercel, Supabase migrations) before writing features.

### Deliverables
- [x] GitHub repo `lscroster` with GPLv3 licence, README stub, `.gitignore`, `.env.example`
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
- The user can sign in as admin on the production URL from their phone.
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
- [x] Worship pastor can roster a month in one sitting via the matrix view. _(confirmed on prod)_
- [x] Lighthouse: 90+ performance and accessibility on key pages. _(accessibility 98 ✓; performance 64 — closed as won't-chase, see the note at the top of this file)_

---

## Phase 5 — Distribution to other churches

**Goal:** any reasonably technical person at another church can stand up their own instance.

### Deliverables
- [x] `docs/SETUP.md`: step-by-step — fork repo → create Supabase project → run migrations (`supabase db push`) → deploy functions → Vercel → secrets + Vault → auth lockdown → first-run wizard → Resend domain → optional demo data → verification checklist + troubleshooting, with screenshots
- [x] "Deploy with Vercel" button in README
- [x] Seed script with demo data (`supabase/seeds/demo-data.sql`, `npm run db:demo`) plus a wipe (`demo-wipe.sql`, `npm run db:demo:wipe`)
- [x] `docs/UPGRADE.md`: pull the tagged release into your fork → `db push` → `functions deploy` → push to `main`; database-first order, rollback, local trial run
- [x] Branding configurable per instance: church name, logo, **accent colour** (migration 0039 `brand_accent`) and address — all via Settings, no code edits
- [x] Resend setup guide including custom domain/DNS/DMARC (SETUP.md step 10)
- [x] Backup guidance — `docs/BACKUPS.md` (what each Supabase plan gives you, `db dump`, storage files, restore, yearly fire drill)
- [x] README: screenshots, feature list, comparison scope vs Planning Center, licence (GPLv3), CI badge, docs index
- [x] Dry run: deploy a second clean instance from the docs alone, timing it; fix every friction point found

### Acceptance criteria
- A second, fully independent instance deployed using only the documentation, in under an hour, with zero code changes.

### Phase 5 notes

**Accent colour (migration 0039 `brand_accent`).** `church_settings.brand_hue`
(smallint 0–360, default 278 = the shipped indigo, so existing instances are
byte-identical after the migration). The whole theme already derived from one
`--brand-hue` oklch variable in `src/index.css`; `src/lib/brand.ts` holds the
presets/clamp/localStorage cache, `src/app/brand-accent.tsx` applies the saved
hue above the router (church_settings is anon-readable, so the sign-in page is
branded too), and `main.tsx` re-applies the cached hue synchronously at boot to
avoid a flash of indigo on every reload. The Settings → Church swatch grid
previews live and reverts on navigate-away if not saved. RLS unchanged:
admin-only write, everyone (incl. anon) reads.

**Demo data.** Every demo row's id starts with `0de00`, which is what makes the
wipe exact — it deletes only demo rows and leaves real data alone. Demo people
have **no email address** on purpose (they can't be invited or emailed by
accident), the songs are public-domain hymns only, and plan dates are computed
relative to `current_date` so the demo always looks current. The rosters are
deliberately clash-free — an out-of-the-box "Double-booked" warning was the
first thing the dry run surfaced.

**`supabase/seed.sql` (local only).** Loads no data — a fresh local stack must
land on the setup wizard, like a new church. It repairs the local DML-grants
quirk (see the gotcha above) and deliberately excludes `people` from the blanket
grant so migration 0024's column-level lock on email/phone/birthday stays
intact; a blanket grant there would mask a real security regression. Seeds never
run against a hosted project.

**Dry run (local, 2026-08-21).** `db reset --local` → wizard on a fresh DB →
demo data → drive the UI. Verified: all 39 migrations apply from scratch; the
`setup` Edge Function creates church + first admin and signs in; demo data loads
and wipes cleanly (idempotent both ways); accent colour persists and RLS holds
(member read ✓, member write ✗, anon write ✗). Friction fixed: the wizard's
church-name placeholder was hard-coded to "Life Sanctuary Church" (now generic)
and the demo roster double-booked two people. Screenshots (dashboard,
plan, matrix, phone respond page, Settings → Church) were captured headlessly
from that demo instance into `docs/screenshots/` — light mode, 2× DPR, demo data
only, so no real person's details are published; `docs/screenshots/README.md`
records the recipe for re-shooting.

**Dry run (second instance, hosted, 2026-08-21).** A genuinely independent
instance — new Supabase project (`lscroster-dryrun`, ap-southeast-2) and new
Vercel project, from a fresh clone at `C:\dev\lscroster-dryrun`, against the
docs alone. **36 minutes wall clock, zero code changes**, so the Phase 5
acceptance criterion holds.

| Step | Time | |
| --- | --- | --- |
| 1 clone + `npm install` | 1m05s | |
| 2 create project | ~40s | `supabase projects create` works as well as the dashboard |
| 3 `link` + `db push` | 12s | all 39 migrations |
| 4 `functions deploy` | 1m30s | 16 functions, **no Docker needed** |
| 5 Vercel | 2m | CLI path; see caveat below |
| 6–7 secrets + Vault | ~1m | |
| 8–9 dashboard toggles + wizard | the user | |

Verified on the new instance: 40 tables all with RLS on, 4 storage buckets, 31
db functions; `/auth/v1/signup` returns `422 signup_disabled`; anon holds only
`church_settings` (demo data present but invisible — `people` refuses at the
grant level, everything else filters to `[]`); demo seed loads, wipes exactly
and reloads on a *hosted* database, not just locally; and the hourly job fired
by itself at the top of the hour — `cron.job_run_details` `succeeded`,
`net._http_response` `200 {"ok":true,"skipped":"outside send hour"}` — proving
the pg_cron → pg_net → function → Vault-secret chain end to end on a project
that was empty an hour earlier. The user then walked step 12 on the live instance —
invite, roster, send a scheduling request and answer it from the emailed link
without logging in — and `email_log` recorded the send as `sent`.

Doc fixes it produced: warn that `npm install`'s vulnerability summary and the
absence of Docker are both fine (step 1); say that a 2026 project shows the key
as `sb_publishable_…` (step 5); add the `job_run_details` query that proves the
cron actually called the function (step 7); add the `signup` curl that proves
sign-ups are shut (step 8); replace "paste into the SQL Editor" with
`db query --linked -f` for demo load and wipe (step 11).

**Caveat, recorded deliberately:** step 5 was done with the Vercel CLI
(`project add` → `link` → env vars → `deploy --prod`), not the documented
"import your fork at vercel.com/new". The git-connected import is stock Vercel
behaviour and is what the LSC instance runs on, but it was not re-exercised
here. `vercel link` also appends `VERCEL_OIDC_TOKEN` to `.env.local` (appends —
it does not clobber).

---

## Releases

Versioned as `v<major>.<minor>.<patch>` git tags; each tag gets a GitHub release
whose notes are mirrored here. Other churches upgrade tag-to-tag —
see `docs/UPGRADE.md`.

| Version | Date | Highlights |
| --- | --- | --- |
| `v1.0.0` | 2026-08-21 | First distributable release. Phase 5: `docs/SETUP.md` / `UPGRADE.md` / `BACKUPS.md`, README rewrite with screenshots, demo data seed + wipe, per-instance accent colour (migration 0039 `brand_accent`). Proven by a second-instance dry run: new Supabase + Vercel projects from the docs alone in 36 minutes, zero code changes. **No action needed by existing instances** — 0039 is additive and defaults to the shipped indigo, so nothing changes appearance or behaviour on upgrade. |
| `v1.0.1` | 2026-08-25 | Version footer at the bottom of Settings, visible to every user: app name, release version, build commit and build date, plus the GPLv3 copyright line. Version is now declared in `package.json` and stamped into the bundle at build time (`vite.config.ts` → `__APP_VERSION__`), with the commit SHA from `VERCEL_GIT_COMMIT_SHA` (Vercel) or `git rev-parse` (local). **No action needed by existing instances** — no migration, no new secret. |
| `v1.0.2` | 2026-08-25 | Fix: the footer's `+` dirty-tree marker fired on every Vercel build (its build steps leave files behind, so `git status --porcelain` is never empty there). It is now computed only outside CI/Vercel, where it means what it says — this bundle came from someone's working tree. **No action needed by existing instances.** |
| `v1.0.3` | 2026-08-28 | Multi-lingual lyrics (migration 0040): each line of a song can carry the original script, an English meaning and chords alongside the singable Latin text, edited in a side-by-side split and toggled per reader. Chords use ChordPro brackets and every lyric surface is proportional; the base text is now required to be Latin script, and pasted songs can be imported straight into the layers. Also: change your own password and reveal any password field, hover tooltips across the whole app, plan Prev/Now/Next fixes, and `npm test` in CI. **Action needed:** `npx supabase db push` (0040) and `npx supabase functions deploy projection-api` **before** the new bundle goes live. Chord lines typed with column alignment want re-typing in brackets. |
| `v1.0.4` | 2026-09-27 | Access control: the global Leader role is now **Coordinator** (0044, rename in place); six **permissions a member can be granted** from their person page — edit order of service, publish, create & delete plans, manage songs, attach plan files, view all plans — held implicitly by admins and coordinators, with **permission templates** and audit entries (0045); Settings → **Deletion safety** switches for people and songs. Optional **AI help** with songs behind `GEMINI_API_KEY` (meaning drafts, transliteration polish/from scratch, tags, section labels). Chords stored as numbers of the key, read in either notation, projection notation per instance (0041); chord-chart import and Worship Together search. Per-plan tempo (0042), song notes (0043), language tags, duplicate-song warning. Archived people out of scheduling; Edge Functions type-checked and tested in CI. **Action needed:** `npx supabase db push` (0041–0045) and `npx supabase functions deploy` (all; two new) **before** the new bundle goes live. Optional new secrets `GEMINI_API_KEY` / `GEMINI_MODEL`. Admins will see Coordinator where they saw Leader. |

Anything that needs action from an instance owner on upgrade — a new secret, a
manual step, a behaviour change their team will notice — must be called out in
that release's notes.

**The git tag is the release; `package.json.version` is what the app displays.**
Since v1.0.1 the Settings footer shows the version, so the number has to be in
the tree: Vercel builds from a tagless shallow clone, so `git describe` is not
available at build time. `vite.config.ts` reads `package.json.version` into
`__APP_VERSION__`; the build id beside it is the commit SHA, from
`VERCEL_GIT_COMMIT_SHA` on Vercel or `git rev-parse HEAD` locally (a trailing
`+` means the build came from a dirty working tree). Nothing else reads
`package.json.version` and the app is still never published to npm.

To cut a release: bump `package.json` (and the lockfile's two root `version`
fields) in the release commit, `git tag -a vX.Y.Z` with the same number, push
both, `gh release create`, and mirror the notes into the table above. Keep the
two in step — a tag whose `package.json` says something else makes the footer
lie.

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
