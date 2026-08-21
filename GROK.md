# GROK.md — LSCroster

This is the project instruction file for Grok (xAI). It mirrors CLAUDE.md for compatibility when working with Grok Build / Grok CLI.

## Current state (as of 2026-08-21)

- **Phases 0–4 are deployed** to production (Life Sanctuary Church). Phase 3's real-user parallel run continues alongside.
- **Phase 5 (distribution) is complete** — released as **v1.0.0** on 2026-08-21: `docs/SETUP.md`, `docs/UPGRADE.md`, `docs/BACKUPS.md`, README rewrite with screenshots, demo-data seed + wipe (`npm run db:demo`) and per-instance accent colour (migration 0039). Proven by a second-instance dry run: new Supabase + Vercel projects from the docs alone in 36 minutes, zero code changes.
- Work is **issue-driven** against the GitHub backlog (`mvmran/lscroster`). Prefer open issues + the "Post-Phase-4 enhancements" section of `PHASES.md` over phase checklists.
- **Schema:** 39 migrations in `supabase/migrations/`, through `brand_accent` (PHASES 0039). After pulling schema changes, regenerate types from the **local** stack.
- **Recently shipped (post-Phase 4):** conditional relationship rules incl. person/same-person effects (#113); Projection API (#135); worship set-list email + team types (#133/#134); arrangement-centric songs, medleys, versioned lyrics (#130); audit log (#116); roster-status digest (#117); configurable scheduled-job hours (#120); team leaders/viewers; managed accounts; contact visibility; plan min-count overrides; indigo/3D UI modernization (client-only).
- **Open backlog (snapshot):** #136 reorder-teams popup bug; #103 reports; #90 consolidate roster emails; longer-horizon TODOs (#7 keyboard shortcuts, #9 rehearsals, #41 SMS). Confirm against GitHub before starting work.
- Full schema notes, upgrade caveats, and local-stack gotchas live in **`PHASES.md`** — re-read it at the start of non-trivial work.

## What this project is

LSCroster is an open-source worship & service planning web app for churches, replicating the
core functionality of Planning Center **Services** plus a lightweight **People** module.
First deployment is for Life Sanctuary Church (Sydney, ~50 users), but the app is designed to
be **distributable**: any church can deploy its own independent instance.

Built and maintained by a **solo developer using AI coding assistants (Claude Code and Grok)** for all coding, deployment and
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
/src
  /app            # router (lazy routes + Suspense), providers, layout shell
  /components/ui  # shadcn components (generated — don't hand-edit heavily)
  /components     # shared app components (PageHeader, EmptyState, StatusBadge, …)
  /features
    /auth         # sign-in, invite acceptance, password reset, setup wizard
    /dashboard    # home page: this week, my requests, my upcoming dates
    /people       # People module (directory, import, managed accounts, email prefs)
    /services     # service types, plans, order of service, songs/arrangements,
                  # lyrics, print/PDF, song reports
    /scheduling   # teams, positions, assignments, blockouts, matrix,
                  # auto-scheduler, scheduling/conditional rules,
                  # my-schedule, public /respond/:token page
    /settings     # church settings, users & roles, communications setup,
                  # email log, audit log, projection API keys
  /lib            # supabase client, helpers, constants, status tokens
  /types          # generated DB types + shared types
/supabase
  /migrations     # ALL schema changes live here (timestamped SQL)
  /functions      # setup, invite, accept-invitation, delete-person,
                  # account-access, send-email, send-requests,
                  # respond-to-request, cancel-assignment,
                  # send-plan-notification, send-setlist, reminders,
                  # run-scheduled-job (admin "send now"),
                  # request-password-reset, projection-api
                  # (_shared/: resend, auth, email-log, email-prefs,
                  #  scheduling, roster-status, lyric-sections,
                  #  person-status, email-templates/)
/docs             # SETUP.md, UPGRADE.md, BACKUPS.md, PROJECTION-API.md,
                  # DESIGN-conditional-rules.md, screenshots/,
                  # projection-api-bruno/
```

Storage buckets: private (signed URLs) — `photos`, `song-attachments`,
`plan-attachments`; public — `church-logo`.

## Database conventions

- snake_case names; `uuid` PKs (`gen_random_uuid()`); `created_at`/`updated_at timestamptz` on every table (updated via trigger).
- **Every table has RLS enabled.** No exceptions. Policies are role-based (and, for scheduling writes, often **per-team**).
- Roles (enum `app_role`): `admin` (everything), `leader` (governance + broad read; team **writes** require Team Leader appointment via `can_manage_team()`), `member` (view plans they're on, respond to requests, manage own profile & blockouts).
- Per-team access: `team_leaders` / `team_viewers` (`team_access_grants`) with helpers `leads_team()`, `can_manage_team()`, `views_team()`, `is_viewer_of_plan()`. Team Viewers get read-only rosters (incl. drafts) for their teams.
- Managed accounts: `people.managed_by_person_id` — managers see managed people's assignments/plans and can act for them within RLS.
- Contact visibility: members do not always see `email`/`phone`/`birthday`; app reads go through the masked `people_directory` view + `can_view_contact()`.
- `people` is the canonical person record and may exist **without** a login. `people.auth_user_id` (nullable) links to `auth.users` once the person accepts an email invitation. Role lives on `people.role`.
- Schema changes happen **only** via migration files (`npx supabase migration new ...`). Never edit schema in the Supabase dashboard. Migrations must be re-runnable on a fresh database (this is the distribution upgrade path).
- After schema changes, regenerate types (see Commands; use the local stack during development).
- Plan visibility: members see **published** plans, plus any plan they're scheduled onto (even drafts) via the `is_assigned_to_plan()` security-definer helper — it must be security definer to avoid RLS policy recursion between `plans` and `plan_assignments`. Managers and Team Leaders/Viewers get additional visibility via related helpers. `plan_items`, `plan_times` and `plan_attachments` follow the same rule.
- Members can update only their own `plan_assignments` row, and only the response columns (`status` to confirmed/declined, `responded_at`, `decline_reason`) — enforced by the `protect_assignment_columns` trigger, mirroring `protect_people_columns`.
- Songs are **arrangement-centric**: plan items reference `arrangement_id` (not bare `song_id`); lyrics are versioned on the arrangement; published plans pin a lyrics version.

## Auth & email

- Supabase Auth, email + password, **invite-only** (public signups disabled). Admin invites a person → invitation email (Resend) → person sets password → account linked to their `people` row. Password reset goes through the `request-password-reset` Edge Function (not client-side Resend).
- All outbound email goes through the shared Resend helper in `supabase/functions/_shared/resend.ts`; every send attempt is logged to `email_log` (admin-viewable at Settings → Email log). HTML templates live in `supabase/functions/_shared/email-templates/`. Per-person opt-outs and managed-account routing live in `_shared/email-prefs.ts`. Scheduling mail is gated on active, emailable people (`isEmailableActive` / #126).
- Scheduling requests are answerable **without logging in**: emails link to `APP_URL/respond/<token>` (raw token only ever in the email; sha-256 hash in `plan_assignments.token_hash`), and that public page calls the `respond-to-request` Edge Function (verify_jwt off — the token is the credential). Answers can be changed until the service date passes.
- Reminders: an hourly `pg_cron` job (`lscroster-reminders`) calls the `reminders` Edge Function via `pg_net`, reading the function URL and a shared secret from **Vault** (`reminders_function_url`, `reminders_cron_secret`); the function checks the `x-cron-secret` header against its `CRON_SECRET` env. It runs **three jobs** off the one hourly schedule, each gated on its admin-configured hour in church timezone (`church_settings.nudge_hour` / `reminder_hour` / `roster_status_hour`, defaults **9 / 9 / 20**): (1) nudge unanswered requests after `request_nudge_days`, (2) remind confirmed people `reminder_days_before` days out (idempotent via `nudged_at`/`reminded_at`), (3) "upcoming roster status" digest (#117) to Team Leaders, Team Viewers and admins (a plain `leader` only qualifies if also a TL/TV), covering `roster_status_weeks` weeks ahead and scoped to each recipient's teams (admins see all). A `0` setting disables that job. An admin can run any job on demand from Settings → **Communications setup** ("send now"), which calls `run-scheduled-job` (admin-only); it POSTs the `reminders` function `{ force: true, only: <job> }` in the background. No new cron/Vault secret — it reuses the existing hourly job and `CRON_SECRET`. The digest's pie chart is rendered by **QuickChart.io** (aggregate category counts only — no personal data); the RAG-coloured table is authoritative if the image is blocked.
- On publish (optional): plan-notification emails and the worship **set-list** email (`send-setlist`, #133/#134) when `send_setlist_on_publish` is on; recipients come from `setlist_recipients`. Set-list can also be sent on demand from the plan ⋯ menu.
- **Projection API** (`projection-api`, #135): read-only published plans + versioned lyrics for the church's Mac projection software; admin-issued API keys (`lscp_…`, hash stored in `projection_api_keys`); contract in `docs/PROJECTION-API.md`. No Supabase key is shared with the projection app.

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
npm run dev                      # local dev server (5173)
npm run build                    # production build (must pass before any push)
npm run lint                     # eslint
npm run typecheck                # tsc --noEmit
npm test                         # vitest run
npm run db:types                 # types from the LINKED (production) project
npx supabase start               # local Supabase stack (Docker Desktop must be up)
npx supabase db reset --local    # rebuild local DB from migrations
npx supabase db push --yes       # apply migrations to the linked (production) project
npx supabase functions deploy <name>
npx supabase functions serve --env-file .env.functions.local   # run functions locally
npx supabase db query --linked "<sql>"   # run SQL on production (vault, cron checks)
```

During development, generate types from the **local** stack instead of production:
`npx supabase gen types typescript --local > src/types/database.ts` — run it via
bash/npm, not PowerShell (PowerShell `>` writes UTF-16 and corrupts the file).

Deployment = merge to `main`; Vercel deploys automatically.
**Deploy order matters:** `db push` migrations (and `functions deploy`) **before**
`git push` — Vercel ships the new bundle immediately and it must not hit a
production database that lacks its tables.

## Working rules for Grok (and Claude Code compatibility)

1. **Follow `PHASES.md`.** Phases 0–5 are complete (v1.0.0, 2026-08-21); work is now issue-driven against the GitHub backlog. Tick checkboxes as items complete, and don't start new phase-sized work without explicit confirmation from Manoj. Other churches now run copies, so keep `docs/SETUP.md`, `docs/UPGRADE.md` and `.env.example` true whenever a step, secret or command changes, and never hard-code Life Sanctuary specifics into the app.
2. **Never** run destructive commands against the linked production project (`db reset`, dropping tables, deleting storage buckets) without explicitly confirming with Manoj first. Local Docker DB is fair game.
3. Every schema change = a new migration file + regenerated types + RLS policies in the same migration.
4. TypeScript strict; no `any`; validate external input with Zod.
5. Mobile-first responsiveness is mandatory — most members will open plans and respond to requests on their phones.
6. Keep dependencies minimal; prefer the locked stack over adding libraries.
7. Conventional commits (`feat:`, `fix:`, `chore:`, `db:`); small commits; `build` + `typecheck` (and `npm test` when relevant) must pass before pushing.
8. Anything that would break an existing church instance on upgrade (renamed columns, changed email links) needs a migration path and a note in that issue's `PHASES.md` entry.
9. UI language: modern, clean, fast. Sunday-morning-proof: big touch targets, obvious states, minimal clicks for the common tasks (view this week's plan, respond to a request).
10. Verify on the local stack before deploying: `npx supabase db reset --local`, seed test users (local auth admin API + `docker exec supabase_db_lscroster psql`), drive the UI in a browser, and probe RLS at the API level with a member JWT — hidden buttons are not security. See `PHASES.md` for the local grant gotcha after `db reset --local`.
11. Use the todo_write tool for any multi-step or complex task (3+ steps). Mark items completed as you finish them; do not batch completions.
12. For ambiguous architecture, high-impact refactors, or unclear requirements, consider entering plan mode first (`enter_plan_mode`).

## Project rules discovery (Grok specific)

Grok automatically loads project instruction files. This `GROK.md` lives alongside `CLAUDE.md` for cross-tool compatibility.

- For guaranteed loading by Grok regardless of name, files are also placed under `.grok/rules/`.
- Always prefer the content in these files over generic assumptions.
- When in doubt about next actions, re-read `PHASES.md` (especially Post-Phase-4) and the open GitHub issues.

## Glossary (Planning Center terminology we mirror)

- **Service type** — recurring gathering (e.g. "Sunday 10am").
- **Plan** — one dated instance of a service type, with an order of service and scheduled people.
- **Plan item** — a row in the order of service: header, song, or generic item, with a duration.
- **Arrangement** — a playable version of a song (or medley of songs) with key/BPM/meter and versioned lyrics; what a plan item actually references.
- **Team / Position** — e.g. Worship team / Acoustic guitar; people are scheduled into positions on a plan.
- **Team Leader / Team Viewer** — per-team grants; TL can manage that team's roster; TV is read-only for that team's plans/assignments.
- **Blockout** — a date range a person is unavailable.
- **Scheduling request** — pending assignment a person accepts/declines (via email link or in-app).
- **Conditional rule** — if the person in a trigger position matches a condition (sex / specific person / any), then target positions need a count, a specific person, or the same person (cross-team mirror).
