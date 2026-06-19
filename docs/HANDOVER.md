# Session handover — LSCRoster

_Last updated: 2026-06-19_

This is a working handover note for continuing development in a fresh Claude Code
session. Read `CLAUDE.md` first for the project rules; this file captures only the
**live state** that isn't obvious from the repo. Full per-issue history lives in
`CHANGELOG.md` and `PHASES.md`.

## Current state of the tree

- Branch `main`, clean, synced with `origin/main`. Latest commit **`ccea615`**
  (#79 follow-up: Matrix drops the song-key badge + goes full-width), on top of
  the **#78 / #79** merge (`8bfac28`).
- Production (**lscroster.xyz**) is up to date; Vercel auto-deploys from `main`.
- Schema: migrations **0006 – `20260619140000_drop_team_exclusions`** in
  `supabase/migrations/`. The three most recent migrations:
  - `20260619100000_account_access_guards` (#44/#45) — self-demotion guard +
    ban/session triggers on archive.
  - `20260619100100_plan_template_times` (#73) — `plan_template_times` table.
  - `20260619140000_drop_team_exclusions` (#76) — dropped the `team_exclusions`
    table (prod had 0 rows; was an explicit confirmed destructive prod drop).
- **No outstanding manual prod steps.** (The #39 reset-password redirect URL —
  `https://lscroster.xyz/reset-password` in Supabase **Auth → URL Configuration →
  Redirect URLs** — was added 2026-06-19.)

## What just shipped — #78 / #79 (this session)

Client-only, **no schema**. Branch `feat/duplicate-service-warning-and-matrix-order`,
merged `8bfac28`; follow-up tweaks in `ccea615`. Verified on the local stack
(build + lint + typecheck + 90 Vitest + **live browser** on a reseeded local DB).

- **#78 — warn before a duplicate service.** New pure `findClashingPlans` /
  `ClashCandidate` in `service-utils.ts` (Vitest) reuse the #14 `timesOverlap`
  helper (imported from `scheduling-utils.ts`) to find existing plans on the
  **same date** whose service-time window overlaps the new one. A shared
  `PlanClashDialog` (soft "Create anyway" confirm, rendered as a fragment sibling
  of the parent `Dialog`) gates creation in `new-plan-dialog.tsx`
  (single / repeat-weekly / template / copy — `attemptCreate` checks every
  `weeklyDates` date, de-dupes by id) and the plan-page `DuplicateDialog`
  (`attemptDuplicate`, `excludeId: plan.id`).
  - **Interpretation (settled with Manoj):** "use the time on the service, not the
    service type" = dedupe by **time overlap**, not by service-type identity. The
    time *source* stays the service type's `default_start_time` / `end_time` (the
    only start+end span we store). **Do NOT** add an end time to `plan_times` for
    this — Manoj explicitly declined that extension.
- **#79 — ORDER section in the Matrix.** A new top section (above the team
  sections) lists each plan's order of service with running start times
  (`computeItemTimes` off the service-type start) and headers. Each row is
  draggable via the existing `useReorderPlanItems` (one `DndContext` **per
  column**; grips gated on `canManage` = admin/leader, RLS-enforced too). Removed
  the grid's redundant "Position" `<th>` label.
  - **Follow-up (`ccea615`):** the song **key badge was removed** from the ORDER
    cells (dropped the `useSongs`/`songById` plumbing); and the Matrix now uses
    the **full width** up to the sidebar — `app/layout.tsx` toggles `max-w-none`
    vs `max-w-5xl` via `useLocation().pathname === '/services/matrix'`. Other
    pages keep the centred 1024px reading width.

## Recent batches (all on `main`, all verified + deployed)

Newest first. Detail in `CHANGELOG.md` / `PHASES.md`; schema noted where relevant.

| Batch (merge) | What | Schema |
|---|---|---|
| **#78 / #79** (`8bfac28`) | Duplicate-service time-overlap warning; Matrix ORDER section + full-width grid | none |
| **#76 / #77** (`19c7439`) | Removed the team-exclusions feature entirely; admin-only **bulk People** actions (select → Send invitation / Archive) | **0019** drop `team_exclusions` |
| **#44 / #45 / #60 / #73** (`a7f0ea2`) | Admin self-demotion guard; archived members lose sign-on (ban + session triggers); shared password rules (`auth/password-utils.ts`); plan **Times** saved in templates & copies | **0017** access guards, **0018** `plan_template_times` |
| **Matrix toolbar** (`4dc4762`) | Columns **slider** (replaced the #57 −/+ stepper) + **Now** button + Weeks/Columns labels; new `components/ui/slider.tsx` | none |
| **#64 / #65 / #66 / #68 / #74** | Confirm before removing a team membership; two-step Add-to-team multi-position picker; Matrix collapse/hide columns (`fillMatrixWindow` + restore chips); Matrix team-name link + "View member" | none |
| **#67 / #69 / #70 / #71 / #72** | Matrix ←/→ week paging + Now; plan-page Prev/Today/Next; single-service-type team ordering; inline position `min_count` −/+ on a plan; new-plan repeat-until-date (`weeklyDates`) | none |
| **#50 / #51 / #61 / #62** | Service-types list + Teams-required dnd reorder; template update/delete on save; plan member-name → profile link | none |
| **#38 / #39 / #42 / #43 / #56 / #57 / #58** | Friendly dup-email; forgot-password (`request-password-reset` fn + `/forgot-password` + `/reset-password`); phone validation/format; Pending status + filter; Schedules-card overhaul; Matrix services-shown control; church logo | **church_logo** (logo col + public bucket); #39 added an Edge Function |

Earlier (#1–#37, #47, #49, #52, #54, #55) — see `PHASES.md` "Done & deployed".

## Decisions still in force (don't relitigate without Manoj)

- **Single-tenant per instance.** No `tenant_id`, no shared multi-tenant DB. Each
  church = its own fork + Supabase + Vercel. Push back if asked to add multi-tenancy.
- **No per-team `is_leader`.** Added then reverted (#10); blocked on **#6** ("what
  does Team Leader do"). Role lives on `people.role` only.
- **#32 scheduling-rules epic:** proficiency is **2 levels** (qualified/trainee),
  `requires_level` = `qualified` only; trainees count toward `min_count`
  (TRAINEE_UNSUPERVISED fires only for an all-trainee team); MULTI_POSITION always
  hard-errors; cadence is **hard** in the auto-fill engine but a **warning** on a
  manual edit; `BELOW_REQUIRED_LEVEL` folds into `NO_REQUIRED_LEVEL`.
- **`plan_times` has no end time** and stays that way (see #78 above).

## Gotchas worth remembering

- **shadcn `Checkbox` / radix nested-interactive:** pair a Checkbox (or a
  `DropdownMenuItem`'s sibling button) with a sibling `<label htmlFor>` — do **not**
  nest the radix button inside the label; the label re-forwards the click and
  cancels the toggle.
- **shadcn `Card` has no `forwardRef`** — for dnd, wrap it in a `<div ref={…}>`,
  don't pass `ref` to `Card`.
- **`detectSessionInUrl` runs only at client init** — the reset-password page needs
  a full page load with the recovery hash present; changing only the hash on the
  same path won't trigger it.
- **Optimistic position edits:** validation reads positions from the
  `['positions']` query (`useAllPositions`); invalidating that prefix also
  refreshes `['positions', teamId]`.
- **Cross-feature import is fine** where it reads cleanly: `service-utils.ts`
  imports `timesOverlap` from `scheduling-utils.ts` (no cycle — scheduling-utils
  only imports types).

## Open backlog (GitHub, none started)

- **#27** — Service assignment acceptance email changes.
- **#19** — Member level access.
- **#9** — Rehearsal workflow.
- **#7** — Review keyboard shortcuts.
- **#6** — Define what "Team Leader" does. ⚠️ gates whether per-team leaders return.
- **#40** — Accounts for minors without an email.
- **#41** — SMS integration.
- **#48** — Session expiry.
- **#59** — Position pairings per member (allow same person in multiple positions
  without double-booking); labelled _non-issue_ — confirm scope with Manoj.

**Phase 5 (distribution)** — needs Manoj's confirmation before starting. Will be
docs-heavy: `SETUP.md`, `UPGRADE.md`, seed/demo data, deploy button, dry run.

## How we work (project-specific reminders beyond CLAUDE.md)

- **Issue workflow:** implement → verify (build + local `db reset --local` + RLS
  probe with a member JWT + browser UI) → confirm with Manoj → **`db push` +
  `functions deploy` BEFORE `git push`** (Vercel ships the bundle immediately and
  must not hit a DB missing its tables) → merge `--no-ff` → close the issue. One
  feature commit + a separate docs commit. Client-only batches skip `db push`.
- Combine verification across similar issues in a batch to save time/tokens.
- **Never** run destructive commands against linked **production** (`db reset`,
  drop table/column, delete buckets) without confirming with Manoj — and the
  auto-mode classifier will block the first such `db push` until you ask. Local
  Docker DB is fair game.
- Regenerate types via **bash, not PowerShell**:
  `npx supabase gen types typescript --local > src/types/database.ts`
  (PowerShell `>` writes UTF-16 and corrupts the file).
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Production is a real church instance (~50 users). TS strict, no `any`, Zod at
  boundaries, mobile-first.

## Verification quickstart (local stack)

```
npx supabase start                 # Docker Desktop must be up; retry once if it wedges
npx supabase db reset --local      # rebuild from migrations
npx supabase gen types typescript --local > src/types/database.ts   # bash only
npm run build && npm run lint && npm run typecheck && npm test
npm run dev                        # then drive the UI via preview_* tools
```

**The local DB has no `seed.sql`** — after a reset it's empty (no users, no
`church_settings`, so the app routes to `/setup`). To drive the UI you must reseed:

1. Keys: `npx supabase status` (current local format: Publishable `sb_publishable_…`,
   Secret `sb_secret_…`).
2. Create a confirmed admin via the GoTrue admin API:
   `curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users` with
   `apikey` + `Authorization: Bearer` = the **secret** key and body
   `{"email":…,"password":…,"email_confirm":true}`; grab the returned `id`.
3. One psql batch: insert a `church_settings` row (else `/setup`), a `people` row
   (role `admin`, `auth_user_id` = that id), and whatever domain data you need
   (`service_types` with start/end times, `plans`, `plan_items`, …). Pipe SQL via
   `MSYS_NO_PATHCONV=1 docker exec -i supabase_db_lscroster psql -U postgres -d postgres < file.sql`
   — Git Bash mangles container paths for `-f` / `docker cp`.

**RLS probe:** seed a member JWT and confirm member writes to new rule tables → 403,
reads → 200, admin writes → success. Hidden buttons are not security.

**preview_* tool notes:** `preview_eval` arg is `expression` (no top-level `await`);
`preview_click` needs a CSS `selector` (no `:has-text`/`ref`) — click a button by
text via eval; set a React-controlled input with the native value setter +
`input`/`change` events; a programmatic `/auth` fetch does **not** log the SPA in,
use the sign-in form. Radix `Select` isn't a native `<select>` — `preview_fill`
can't set it; click by text via eval.
