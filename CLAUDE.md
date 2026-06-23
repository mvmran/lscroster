# CLAUDE.md — LSCRoster

## What this project is

LSCRoster is an open-source worship & service planning web app for churches, replicating the
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
/src
  /app            # router (lazy routes + Suspense), providers, layout shell
  /components/ui  # shadcn components (generated — don't hand-edit heavily)
  /components     # shared app components
  /features
    /auth         # sign-in, invite acceptance, setup wizard
    /dashboard    # home page: this week, my requests, my upcoming dates
    /people       # People module
    /services     # service types, plans, order of service, songs, print/PDF
    /scheduling   # teams, positions, assignments, blockouts, matrix,
                  # my-schedule, public /respond/:token page
    /settings     # church settings, users & roles, email log
  /lib            # supabase client, helpers, constants
  /types          # generated DB types + shared types
/supabase
  /migrations     # ALL schema changes live here (timestamped SQL)
  /functions      # setup, invite, accept-invitation, delete-person,
                  # send-email, send-requests, respond-to-request, reminders
                  # (_shared/: resend, auth, email-log, scheduling, templates)
/docs             # SETUP.md, UPGRADE.md, screenshots
```

Storage buckets (all private, served via signed URLs): `photos`,
`song-attachments`, `plan-attachments`.

## Database conventions

- snake_case names; `uuid` PKs (`gen_random_uuid()`); `created_at`/`updated_at timestamptz` on every table (updated via trigger).
- **Every table has RLS enabled.** No exceptions. Policies are role-based.
- Roles (enum `app_role`): `admin` (everything), `leader` (manage plans/teams/songs for their teams), `member` (view plans they're on, respond to requests, manage own profile & blockouts).
- `people` is the canonical person record and may exist **without** a login. `people.auth_user_id` (nullable) links to `auth.users` once the person accepts an email invitation. Role lives on `people.role`.
- Schema changes happen **only** via migration files (`npx supabase migration new ...`). Never edit schema in the Supabase dashboard. Migrations must be re-runnable on a fresh database (this is the distribution upgrade path).
- After schema changes, regenerate types (see Commands; use the local stack during development).
- Plan visibility: members see **published** plans, plus any plan they're scheduled onto (even drafts) via the `is_assigned_to_plan()` security-definer helper — it must be security definer to avoid RLS policy recursion between `plans` and `plan_assignments`. `plan_items`, `plan_times` and `plan_attachments` follow the same rule.
- Members can update only their own `plan_assignments` row, and only the response columns (`status` to confirmed/declined, `responded_at`, `decline_reason`) — enforced by the `protect_assignment_columns` trigger, mirroring `protect_people_columns`.

## Auth & email

- Supabase Auth, email + password, **invite-only** (public signups disabled). Admin invites a person → invitation email (Resend) → person sets password → account linked to their `people` row.
- All outbound email goes through the shared Resend helper in `supabase/functions/_shared/resend.ts`; every send attempt is logged to `email_log` (admin-viewable at Settings → Email log). HTML templates live in `supabase/functions/_shared/email-templates/`.
- Scheduling requests are answerable **without logging in**: emails link to `APP_URL/respond/<token>` (raw token only ever in the email; sha-256 hash in `plan_assignments.token_hash`), and that public page calls the `respond-to-request` Edge Function (verify_jwt off — the token is the credential). Answers can be changed until the service date passes.
- Reminders: an hourly `pg_cron` job (`lscroster-reminders`, created in migration 0004) calls the `reminders` Edge Function via `pg_net`, reading the function URL and a shared secret from **Vault** (`reminders_function_url`, `reminders_cron_secret`); the function checks the `x-cron-secret` header against its `CRON_SECRET` env and only sends during the 9am hour in the church timezone. It nudges unanswered requests after `church_settings.request_nudge_days` and reminds confirmed people `reminder_days_before` days out, idempotently via `nudged_at`/`reminded_at`.

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

## Working rules for Claude Code

1. Follow `PHASES.md`. Work on the current phase only; tick checkboxes as items complete. Don't start a new phase without confirmation.
2. **Never** run destructive commands against the linked production project (`db reset`, dropping tables, deleting storage buckets) without explicitly confirming with Manoj first. Local Docker DB is fair game.
3. Every schema change = a new migration file + regenerated types + RLS policies in the same migration.
4. TypeScript strict; no `any`; validate external input with Zod.
5. Mobile-first responsiveness is mandatory — most members will open plans and respond to requests on their phones.
6. Keep dependencies minimal; prefer the locked stack over adding libraries.
7. Conventional commits (`feat:`, `fix:`, `chore:`, `db:`); small commits; `build` + `typecheck` must pass before pushing.
8. Anything that would break an existing church instance on upgrade (renamed columns, changed email links) needs a migration path and a note in that issue's `PHASES.md` entry.
9. UI language: modern, clean, fast. Sunday-morning-proof: big touch targets, obvious states, minimal clicks for the common tasks (view this week's plan, respond to a request).
10. Verify on the local stack before deploying: `npx supabase db reset --local`, seed test users (local auth admin API + `docker exec supabase_db_lscroster psql`), drive the UI in a browser, and probe RLS at the API level with a member JWT — hidden buttons are not security.

## Glossary (Planning Center terminology we mirror)

- **Service type** — recurring gathering (e.g. "Sunday 10am").
- **Plan** — one dated instance of a service type, with an order of service and scheduled people.
- **Plan item** — a row in the order of service: header, song, or generic item, with a duration.
- **Team / Position** — e.g. Worship team / Acoustic guitar; people are scheduled into positions on a plan.
- **Blockout** — a date range a person is unavailable.
- **Scheduling request** — pending assignment a person accepts/declines (via email link or in-app).
