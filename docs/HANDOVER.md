# Session handover — LSCRoster

_Last updated: 2026-06-21_

This is a working handover note for continuing development in a fresh Claude Code
session. Read `CLAUDE.md` first for the project rules; this file captures only the
**live state** that isn't obvious from the repo. Full per-issue history lives in
`CHANGELOG.md` and `PHASES.md`.

## Current state of the tree

- Branch `main`, clean, synced with `origin/main`. Latest feature merge
  **`f65402d`** — the **misc UI polish batch** (#83, this session, client-only)
  merged from `feat/misc-ui-changes`, on top of the **ad-hoc UI batch** (`6a65dd7`)
  and the **per-plan start time + Matrix Suggest** merge (`f82a639`).
- Production (**lscroster.xyz**) is up to date; Vercel auto-deploys from `main`.
- Schema: migrations **0006 – `20260619145343_plan_start_time`** in
  `supabase/migrations/`. The three most recent migrations:
  - `20260619100100_plan_template_times` (#73) — `plan_template_times` table.
  - `20260619140000_drop_team_exclusions` (#76) — dropped the `team_exclusions`
    table (prod had 0 rows; was an explicit confirmed destructive prod drop).
  - `20260619145343_plan_start_time` — nullable `start_time` on `plans` /
    `plan_templates` (null inherits `service_types.default_start_time`).
- **No outstanding manual prod steps.** (The #39 reset-password redirect URL —
  `https://lscroster.xyz/reset-password` in Supabase **Auth → URL Configuration →
  Redirect URLs** — was added 2026-06-19.)

## What just shipped — misc UI polish batch (#83, this session)

Client-only, **no schema**. Branch `feat/misc-ui-changes`, merged `f65402d`
(Vercel auto-deploys). Verified on the local stack (build + lint + typecheck + 91
Vitest) and driven **live in the browser**. Touched files: `services/plan-page.tsx`,
`scheduling/matrix-page.tsx`, `people/person-page.tsx`, `scheduling/team-page.tsx`.

- **Plan header layout.** Prev/Now/Next moved out of the old absolutely-centred
  wrapper into a right-aligned group that shares one
  `flex flex-wrap items-center justify-end gap-x-6 gap-y-2` row with the
  Draft/Publish/⋯ group — so the nav sits beside Publish (same level), with a gap
  before Draft, and the whole control set **wraps to a second line** on narrow
  screens. **"Today" renamed "Now".**
- **Matrix cell.** The assignment cell is now a plain `div` (was the
  `DropdownMenuTrigger`), holding the person name as a `<Link to=/people/:id>`
  (hover underline) plus a separate **…** trigger button (`ml-auto`, inherits the
  cell's `text-xs`). Clicking the cell no longer opens the menu — only the **…**
  does. The **View &lt;name&gt;** menu item and the now-unused `UserRound` import
  were removed.
- **Back links → browser back.** The back link on `person-page.tsx` and
  `team-page.tsx` now reads **← Back** and calls
  `window.history.length > 1 ? navigate(-1) : navigate('/people'|'/teams')`, so it
  returns to wherever you came from (People, Teams, Matrix, a plan). Dropped the
  person page's old `focusId` nav-state (and its scroll-to/flash on the People list
  no longer fires from this link) and the now-unused `Link` import there.
- **Archive confirm.** The person page **Archive** button is wrapped in an
  `AlertDialog` confirm mirroring Delete (Reactivate stays a direct action).

## Previously shipped — ad-hoc UI batch

Client-only, **no schema**. Branch `feat/adhoc-2026-06-20`, merged `6a65dd7`
(Vercel auto-deploys). A set of direct UI tweaks (not GitHub issues), verified on
the local stack (build + lint + typecheck + 91 Vitest) and driven **live in the
browser** on a reseeded local DB (15 test people inserted via psql — local only,
not committed). Touched files: `app/layout.tsx`, `people/people-page.tsx`,
`people/person-page.tsx`, `people/person-schedule-card.tsx`,
`scheduling/auto-schedule-dialog.tsx`, `scheduling/matrix-page.tsx`,
`scheduling/scheduling-panel.tsx`, `services/plan-page.tsx`.

- **Plan header nav.** Prev/Today/Next moved onto the same row as the date
  heading, absolutely centred (`absolute left-1/2 -translate-x-1/2`); chevrons use
  the `sm` button default size (dropped the `size-4` override) so they match the
  Publish button; darker borders (`border-muted-foreground/40`). The back link is
  now **← Back** and is context-aware: it reads `location.state.from` (default
  `/services`) so a plan opened from the **Matrix** returns to the Matrix. The
  Matrix date links pass `state={{ from: '/services/matrix' }}`.
- **Matrix per-column action buttons.** The first team heading's VOCALS row now
  has three compact (`size-6`), icon-only, left-justified buttons with darker
  borders per service column: **Suggest roster** (`SuggestRosterButton` compact →
  square icon-only, text hidden, tooltip kept), **Send** (`SendColumnButton`,
  moved out of the column header; always shown, disabled when no unsent, tooltip
  `Send N request(s)`), and **Cancel unsent** (`CancelUnsentColumnButton`, new —
  `CircleX` icon, deletes pending+un-notified assignments via `useDeleteAssignment`
  with `Promise.allSettled`, disabled + tooltip `No unsent requests to cancel`
  when none). Unsent ids computed once per column and shared by Send + Cancel.
  Matrix toolbar **Prev/Now/Next** shrunk `h-8` → `h-7` to match the Columns box.
- **Plan People card — Cancel unsent.** `scheduling-panel.tsx` gained a `cancelUnsent()`
  + a right-aligned outline button stacked under **Send N requests** (both only
  shown when `unsentCount > 0`), deleting all pending+un-notified assignments.
- **Person page — back link + return-to-person.** New **← People** back link
  (Services format) passes `state={{ focusId: p.id }}`. `people-page.tsx` reads it
  in a `useEffect`, finds the **visible** row (`data-person-row`, picking the
  variant with a non-null `offsetParent` — the list renders BOTH a mobile card and
  a desktop table, so a plain `id` was ambiguous), `scrollIntoView`, and flashes a
  soft `bg-accent` tint (no ring) for 2s by toggling the class directly (avoids the
  `react-hooks/set-state-in-effect` lint). Nav state cleared via `navigate(replace)`.
- **Scroll-to-top on navigation.** `app/layout.tsx` `window.scrollTo(0,0)` on
  pathname change (so detail pages open at the top), **skipping** when
  `location.state.focusId` is set; the effect depends **only on `location.pathname`**
  (eslint-disabled exhaustive-deps) so clearing the focus state doesn't re-fire it
  and fight the person scroll-into-view.
- **Person page width.** The person detail page (`/people/:id`, not `/new` or
  `/import`) is now full-width — `app/layout.tsx` adds it to the `fullWidth` set
  (alongside the Matrix), and `person-page.tsx` dropped its own `max-w-5xl`. The
  Schedules-vs-detail grid is **45 / 55** (`lg:grid-cols-[45fr_55fr]`).
- **Activity-summary stats.** `person-schedule-card.tsx` `Stat` labels darkened
  (`text-muted-foreground` → `text-foreground/70`); added a `compact` prop
  (value `text-sm` → `text-xs`) used for **Top positions** and **Streak**.

## Recent batches (all on `main`, all verified + deployed)

Newest first. Detail in `CHANGELOG.md` / `PHASES.md`; schema noted where relevant.

| Batch (merge) | What | Schema |
|---|---|---|
| **#83 misc UI polish** (`f65402d`) | Plan-header nav right-aligned + wraps + "Today"→"Now"; Matrix cell name-link + "…" menu trigger; person/team **← Back** = browser back; person **Archive** confirm | none |
| **Ad-hoc UI batch** (`6a65dd7`) | Plan-header nav row + context-aware Back; Matrix per-column Suggest/Send/Cancel-unsent; person-page back-flash; scroll-to-top; full-width person page | none |
| **Per-plan start time + Matrix Suggest** (`f82a639`) | Per-plan `start_time` override; per-column **Suggest roster**; Matrix toolbar (Prev/Now/Next + −/+ Columns + sticky first col) | **`plan_start_time`** nullable `start_time` |
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
- **The People list renders twice** (mobile cards `md:hidden` + desktop table
  `hidden md:block`), so a plain `id` per person is ambiguous — use a
  `data-person-row` attribute and pick the variant whose `offsetParent !== null`
  (the hidden one is `display:none`, so `scrollIntoView` would be a no-op on it).
- **Scroll-on-navigation vs scroll-into-view race:** the layout's
  `window.scrollTo(0,0)` (on pathname change) must depend **only on `pathname`** and
  skip when `location.state.focusId` is set — otherwise clearing that state
  re-fires it and snaps back to the top after the People page scrolls to a person.

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
