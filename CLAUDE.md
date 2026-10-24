# CLAUDE.md — LSCroster

## What this project is

LSCroster is an open-source worship & service planning web app for churches, replicating the
core functionality of Planning Center **Services** plus a lightweight **People** module.
First deployment is for Life Sanctuary Church (Sydney, ~50 users), but the app is designed to
be **distributable**: any church can deploy its own independent instance.

Built and maintained by a **solo developer using Claude Code** for all coding, deployment and
maintenance. Optimise every decision for simplicity, low operational burden, and free/cheap
hosting tiers.

## Core architectural decision: single-tenant per instance

Each church runs its **own** deployment: one GitHub fork/clone → one Supabase project → one
Vercel project. There is **no** shared multi-tenant database and **no** `tenant_id` anywhere.

Why: full data isolation per church, dramatically simpler RLS (role-based only), each church
stays within free tiers, and "distribution" becomes "follow SETUP.md", not "operate a SaaS".
Do not introduce multi-tenancy. If asked to, push back and confirm first.

Church-specific configuration (name, logo, timezone, email sender) lives in a single-row
`church_settings` table populated by a first-run setup wizard.

## Tech stack (locked in — do not substitute without explicit approval)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vite + React + TypeScript (strict) | SPA, no SSR needed |
| Styling | Tailwind CSS + shadcn/ui | Modern, fast, accessible defaults |
| Routing | React Router | Code-split routes per module |
| Server state | TanStack Query | All Supabase reads/writes go through query/mutation hooks |
| Forms/validation | react-hook-form + Zod | Zod schemas at every boundary |
| Drag & drop | dnd-kit | Order-of-service reordering |
| Dates | date-fns + date-fns-tz | Store `timestamptz`; display in church timezone from `church_settings` (default `Australia/Sydney`) |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron) | Project region: Sydney (ap-southeast-2) |
| Email | Resend, called only from Supabase Edge Functions | Never email from the browser; never expose the Resend key client-side |
| Hosting | Vercel (static SPA build) | Auto-deploy from GitHub `main` |
| CI | GitHub Actions | lint + typecheck + build on every PR |

## Repository layout

```
/supabase
  seed.sql        # LOCAL-ONLY reset bootstrap (grants repair; loads no data)
  /seeds          # demo-data.sql / demo-wipe.sql (evaluation data, ids start 0de00)
  /migrations     # ALL schema changes live here (timestamped SQL)
  /functions      # one directory per Edge Function (run `ls supabase/functions`);
                  # _shared/ holds the cross-function helpers and email templates
/docs             # setup, upgrade, backup and API docs, USER-MANUAL.md, plus screenshots/
/scripts          # backup.sh / restore.sh (docs/BACKUPS.md), CI helper scripts
```

Storage buckets (all private, served via signed URLs): `photos`,
`song-attachments`, `plan-attachments`. Download a file with `startDownload()`
(`src/lib/download.ts`) on a URL signed with `download` — never `window.open`
after an await, which iOS Safari blocks silently. A link opened straight from
a tap (pre-signed, like the notice board) is fine.

## Database conventions

- snake_case names; `uuid` PKs (`gen_random_uuid()`); `created_at`/`updated_at timestamptz` on every table (updated via trigger).
- **Every table has RLS enabled.** No exceptions. Policies are role-based.
- **Every new table or view is granted in the migration that creates it.** From 2026-10-30 Supabase no longer grants Data API access automatically (0050 granted everything older), so a table without grants answers `42501 permission denied` before RLS runs:
  `grant select, insert, update, delete on public.<name> to anon, authenticated, service_role;` — RLS still does the real gating. Column-level grants (like `people`) are the exception, never a table-wide `select`.
- **Views are `with (security_invoker = true)`**, so the base tables' RLS applies. A view without it runs as its owner (`postgres`, bypassing RLS) and is often auto-updatable, so the grant line above would hand anon read/write on the base rows. The one owner-run view, `people_directory` (it masks contact columns `authenticated` can't select), gets `select` to `authenticated, service_role` only and nothing for anon (0061); a migration that drops and recreates it must repeat that.
- **Storage policies** (`storage.objects`) can be created by a migration but not altered or dropped. Create each inside a `pg_policies` guard (re-runnable), and narrow an existing one with an `as restrictive` policy rather than replacing it (0062).
- Roles (enum `app_role`): `admin` (everything), `coordinator` (church-wide governance — plans, songs, service types, teams, team-access grants, granting permissions; renamed from `leader` in 0044), `member` (view plans they're on, respond to requests, manage own profile & blockouts). Coordinators manage **and** roster every team church-wide (0047). Anyone else needs a per-team **Team Access** grant — one table `team_grants(team_id, person_id, access)`, enum `team_access` = `viewer` < `scheduler` < `manager` (0048, merged the old `team_leaders` + `team_viewers`). Managing a team (membership, positions) needs `manager` (`can_manage_team()`); scheduling it (assignments, per-plan targets, rule-mutes, set-list email) needs `scheduler`+ (`can_schedule_team()`); `viewer` is read-only (`views_team()`). Grants are appointed by admins/coordinators only.
- **BAU permissions** (0045): members can be granted `edit_order_of_service`, `publish_plans`, `create_delete_plans` (implies editing the order), `manage_songs`, `attach_plan_files`, `view_all_plans` via `person_permissions`. Admins and coordinators hold all of them implicitly. RLS checks `has_permission()`; Edge Functions `callerHasPermission()` (`_shared/auth.ts`); the app `usePermissions()` (`src/features/auth`). Gate new plan/song features on a permission, not on the role.
- **A write that spans several rows is one transaction.** Replacing a set (permissions, team ↔ service-type links, a rule's effects, a template's contents), creating a run of plans, or reordering goes through one security-invoker function (0064–0068), never delete-then-insert or a loop of requests from the browser — a failure partway leaves half-written data. Write only what changed: a reorder sets `sort_order` and nothing else, so a stale screen can't write back old values.
- **A form that saves a whole list waits for that list.** If Save would send a still-loading (empty) list, it replaces the real one with nothing — disable Save until the data it overwrites has arrived.
- **Delete the row, then its files.** `storage.objects` RLS is separate from the row's, and RLS refuses a delete by deleting nothing, without an error. Read the paths, delete with `.select('id')`, throw when nothing went, then remove the files and report any left (`useDeletePlan`, `useDeleteSong`).
- `people` is the canonical person record and may exist **without** a login. `people.auth_user_id` (nullable) links to `auth.users` once the person accepts an email invitation. Role lives on `people.role`.
- Schema changes happen **only** via migration files (`npx supabase migration new ...`). Never edit schema in the Supabase dashboard. Migrations must be re-runnable on a fresh database (this is the distribution upgrade path).
- After schema changes, regenerate types (see Commands; use the local stack during development).
- Plan visibility: members see **published** plans, plus any plan they're scheduled onto (even drafts) via the `is_assigned_to_plan()` security-definer helper — it must be security definer to avoid RLS policy recursion between `plans` and `plan_assignments`. `plan_items`, `plan_times` and `plan_attachments` follow the same rule.
- Members can update only their own `plan_assignments` row, and only the response columns (`status` to confirmed/declined, `responded_at`, `decline_reason`) — enforced by the `protect_assignment_columns` trigger, mirroring `protect_people_columns`.

## Auth & email

- Supabase Auth, email + password, **invite-only** (public signups disabled). Admin invites a person → invitation email (Resend) → person sets password → account linked to their `people` row.
- Password changes are enforced by the auth server, not the UI: an instance turns on "require current password" (`docs/SETUP.md` Step 8; `config.toml` has no key for it, so the local stack runs without it) and Change password sends `current_password`. `secure_password_change` doesn't help — it only asks again once a sign-in is 24 hours old. A reset-link session (`amr` method `otp`) is exempt; `/reset-password` lets one through only within the hour (`isRecentRecovery()`).
- All outbound email goes through the shared Resend helper in `supabase/functions/_shared/resend.ts`; every send attempt is logged to `email_log` (admin-viewable at Settings → Email log). HTML templates live in `supabase/functions/_shared/email-templates/`.
- Email preferences fail closed. Read them with `fetchEmailPrefs` (`_shared/email-prefs.ts`): a person with no row has everything on, but a read that *fails* turns everything off and marks the map `unreadable`, and a function someone pressed a button for stops with a 503 before writing anything. Treating an error as "no rows" emails everyone who opted out. Every email a preference covers passes `prefsUrl(personId)` to `footer()` for its "Update email preferences" link; one no preference covers (invitation, password reset) doesn't.
- A failed send must not read as sent. Anything stamped before a batch goes out (a new `token_hash`, `notified_at`, `nudged_at`, `reminded_at`) is put back when that email fails, so the job retries and the person's existing link keeps working (`send-requests`, `reminders`). Do the database change before the notice about it (cancel-assignment deletes, then emails).
- Scheduling requests are answerable **without logging in**: emails link to `APP_URL/respond/<token>` (raw token only ever in the email; sha-256 hash in `plan_assignments.token_hash`), and that public page calls the `respond-to-request` Edge Function (verify_jwt off — the token is the credential). Answers can be changed until the service date passes.
- Reminders and the roster-status digest: the hourly `pg_cron` job, its Vault secrets and the three jobs it runs are documented in `supabase/functions/CLAUDE.md`.

## Environment variables

| Where | Variable |
|---|---|
| Vercel / `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Supabase Edge Function secrets | `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `CRON_SECRET` |
| Supabase Vault (read by the pg_cron job) | `reminders_function_url`, `reminders_cron_secret` (same value as `CRON_SECRET`) |

Never commit secrets. `.env*` is gitignored; keep `.env.example` current whenever a variable is added.
Vault secrets can be created from the CLI: `npx supabase db query --linked "select vault.create_secret('<value>', '<name>')"`.

## Commands

The Supabase CLI is an npm devDependency — always `npx supabase …`.

```
npm run ci                       # the whole gate, exactly what CI runs
npm run check:functions          # deno check over supabase/functions (needs Deno)
npm run test:functions           # deno test over supabase/functions
npm run db:types                 # types from the LINKED (production) project
npx supabase start               # local Supabase stack (Docker Desktop must be up)
npx supabase db reset --local    # rebuild local DB from migrations
npx supabase db push --yes       # apply migrations to the linked (production) project
npx supabase functions deploy <name>
npx supabase functions serve --env-file .env.functions.local   # run functions locally
npx supabase db query --linked "<sql>"   # run SQL on production (vault, cron checks)
scripts/backup.sh [dest]         # full backup of the linked project (db + logins + files)
scripts/restore.sh <archive> <db-url>    # into an EMPTY project only; refuses otherwise
npm run manual:pdf               # docs/USER-MANUAL.md → manual-pdf/*.pdf (needs Chromium
                                 # once: `npx playwright-core install chromium`)
```

Production is backed up nightly on flint (user crontab, 02:30, into
`~/dev/backups/lscroster`, run from the main checkout). The archives hold every
password hash: never move them into a Syncthing folder, and never point
`restore.sh` at production. `supabase db query -f` cannot load the data dump
(it is `COPY`) — restores go through the script.

During development, generate types from the **local** stack instead of production:
`npx supabase gen types typescript --local > src/types/database.ts` — run it via
bash/npm, not PowerShell (PowerShell `>` writes UTF-16 and corrupts the file).

Both `db:types` commands redirect stdout straight into a source file, so anything
the CLI prints there ends up *inside* it. CLI 2.107 does exactly that: when its
PostHog telemetry flush times out on exit it writes an Effect error object to
stdout and exits 1 — the types generate perfectly, then the file is corrupted and
the command reports failure. Guard it with `SUPABASE_TELEMETRY_DISABLED=1`
(exported from `~/.bashrc` on the Linux box; `DO_NOT_TRACK=1` works too). Keep it
in the shell profile, **not** in the npm script: `db:types` is a maintainer
command that no church instance ever runs, so putting it in `package.json` would
opt other people out of a vendor's analytics and break the script on PowerShell.
If a generated file ever ends with a `{"_tag":"Error",...}` line, that is this —
delete the line and the trailing blank it leaves.

Deployment = merge to `main`; Vercel deploys automatically.
**Deploy order matters:** `db push` migrations (and `functions deploy`) **before**
`git push` — Vercel ships the new bundle immediately and it must not hit a
production database that lacks its tables.

## Working rules for Claude Code

1. Follow `PHASES.md`. **Phases 0–5 are complete (v1.0.0, 2026-08-21)**; work is now issue-driven against the GitHub backlog. Tick checkboxes as items complete, and don't start new phase-sized work without confirmation. Other churches now run copies, so keep `docs/SETUP.md`, `docs/UPGRADE.md` and `.env.example` true whenever a step, secret or command changes, and never hard-code Life Sanctuary specifics into the app.
2. **Never** run destructive commands against the linked production project (`db reset`, dropping tables, deleting storage buckets) without explicitly confirming with user first. Local Docker DB is fair game.
3. Every schema change = a new migration file + regenerated types + RLS policies in the same migration.
4. TypeScript strict; no `any`; validate external input with Zod.
5. Mobile-first responsiveness is mandatory — most members will open plans and respond to requests on their phones.
6. Keep dependencies minimal; prefer the locked stack over adding libraries.
7. Conventional commits (`feat:`, `fix:`, `chore:`, `db:`); small commits; **`npm run ci` must pass before pushing** — it is lint, typecheck, tests, the Edge Function check and tests, and build, in the order the workflow runs them. The two Edge Function steps need **Deno** installed locally (`supabase/functions` is Deno, outside tsconfig and eslint); four legacy functions are excluded from the check and listed with the reason in `scripts/check-edge-functions.mjs`.
   Never run a formatter over existing files — the repo has no formatter and is not prettier-formatted, so a run rewrites
   thousands of lines for nothing. Match the house style by hand: single quotes, no semicolons, ~90 columns.
8. Anything that would break an existing church instance on upgrade (renamed columns, changed email links) needs a migration path and a note in that issue's `PHASES.md` entry.
9. UI language: modern, clean, fast. Sunday-morning-proof: big touch targets, obvious states, minimal clicks for the common tasks (view this week's plan, respond to a request).
   **Australian English everywhere people read** — UI strings, emails, docs, comments: colour, organise, licence (noun), cancelled, labelled, towards. **Meter** for musical time (time signature, e.g. 4/4) — *metre* is only the unit of distance. Code and wire names stay as they are (`color` in CSS, `Authorization`), as do proper nouns ("Planning Center", "GNU General Public License").
10. Verify on the local stack before deploying: `npx supabase db reset --local`, seed test users (local auth admin API + `docker exec supabase_db_lscroster psql`), drive the UI in a browser, and probe RLS at the API level with a member JWT — hidden buttons are not security.
11. **Direct-to-main, including for background jobs.** Solo developer, no PR review
    step: once `npm run ci` passes, commit and push straight to `main` (from a
    worktree, fast-forward `main` onto the branch first). Do not open a pull request
    unless explicitly asked. This is a standing instruction and overrides any default
    guidance about not pushing to the default branch. Deploy order still applies:
    `db push` and `functions deploy` before the push.

## Glossary (Planning Center terminology we mirror)

- **Service type** — recurring gathering (e.g. "Sunday 10am").
- **Plan** — one dated instance of a service type, with an order of service and scheduled people.
- **Plan item** — a row in the order of service: header, song, or generic item, with a duration.
- **Team / Position** — e.g. Worship team / Acoustic guitar; people are scheduled into positions on a plan.
- **Blockout** — a date range a person is unavailable.
- **Scheduling request** — pending assignment a person accepts/declines (via email link or in-app).
