# Session handover — LSCRoster

_Last updated: 2026-06-18_

This is a working handover note for continuing development in a fresh Claude Code
session. Read `CLAUDE.md` first for the project rules; this file captures only the
**live state** that isn't obvious from the repo.

## Current state of the tree

- Branch `main`, clean, synced with `origin/main` (latest merges: **#38 / #39 /
  #42 / #43 / #56 / #57 / #58** batch; before that **#54 / #55** header + Schedules
  formatting, **#52** person-page schedules, **#47** partial-accept, **#33 + #49**
  Matrix team ordering).
- Production (lscroster.xyz) is **up to date** once this batch deploys: the
  `20260618090000_church_logo` migration and the new `request-password-reset` Edge
  Function ship with it; Vercel auto-deploys from `main`.
- Schema since Phase 4: migrations **0006–** `20260618090000_church_logo`
  (see `supabase/migrations/`). Of this batch, only **#58** changed schema (logo
  column + public bucket); **#39** added an Edge Function; #42/#38/#43/#56/#57 are
  client-only.
- **Manual prod step for #39:** add `https://lscroster.xyz/reset-password` to the
  Supabase project's **Auth → URL Configuration → Redirect URLs**, or recovery
  links fall back to the site root instead of the reset page.

## What just shipped

All implemented, verified on the local stack (build + lint + typecheck + Vitest +
RLS probe with a member JWT + browser UI), deployed to prod, and merged to `main`.

| Issue | What | Status |
|---|---|---|
| #29 | Publish emails include the song **Meter** from the Default arrangement | closed |
| #30 | Position **proficiency / eligibility** (qualified/trainee) + manual editing UI | closed |
| #31 | **Order** a service type's required teams (`service_type_teams.sort_order`, 0013) | closed |
| #32 | **Scheduling rules & auto-scheduling — full 5-phase epic** | **closed** |
| #33 | **Order teams in the Matrix** (per-type order + personal localStorage order) | closed |
| #49 | **Drag-and-drop** reorder in the Matrix "Reorder teams" popup (dnd-kit) | closed |
| #47 | **Partial accept** of a roster suggestion — per-suggestion checkboxes + select-all | closed |
| #52 | **Past & upcoming schedules** on the person page + past-period dropdown | closed |
| #38 | **Friendly duplicate-email error** on create/update person | closed |
| #39 | **Forgot-password flow** — `request-password-reset` fn + `/forgot-password` + `/reset-password` | closed |
| #42 | **Phone validation + formatting** (AU mobile / `+cc` international) | closed |
| #43 | **Pending status** on People (no login yet) + filter | closed |
| #56 | **Schedules card**: positions per row, clickable rows, block-out dates, activity summary | closed |
| #57 | **Matrix −/+** services-shown control (localStorage, default 4, 2–9) | closed |
| #58 | **Church logo** — light/dark upload + header & sign-in display | closed |

### #38 / #39 / #42 / #43 / #56 / #57 / #58 batch (this session)

- **#42 phone** — `features/people/phone-utils.ts` (`formatPhone` / `isValidPhone`,
  Vitest). Form validates via Zod + formats on blur; the list, profile and CSV
  import all display through `formatPhone`.
- **#38 dup email** — `use-people.ts` maps Postgres `23505` on `people_email_unique`
  to a friendly message in create + update.
- **#43 pending** — `person-utils.ts` `accountStatus()` (active / pending /
  inactive, derived from `status` + `auth_user_id`). People list shows a **Pending**
  badge + filter; profile shows a "Pending invite" badge. Client-only.
- **#56 schedules card** — `person-schedule-card.tsx` rewritten;
  `usePersonSchedule` extended with position/team/service-type; new
  `useRosterWorkload(enabled)` (admins/leaders only) for the team percentile;
  pure helpers + Vitest in `person-schedule-utils.ts` (`describeStreak`,
  `workloadPercentile`). Positions sort by `serviceTypeTeamSort` then position
  order; rows link to the plan; blockouts via `usePersonBlockouts`. Client-only.
- **#57 matrix −/+** — `use-matrix-plan-count.ts` (per-login localStorage, default
  4, clamp 2–9), wired into `matrix-page.tsx` replacing the old fixed constant.
- **#58 logo** — migration `20260618090000_church_logo` (logo_dark_url + public
  `church-logo` bucket, admin-write RLS). `use-church-logo.ts` (upload/clear +
  `logoPublicUrl`) and `church-logo.tsx` (`<ChurchLogo>` theme-aware, falls back to
  the icon). Upload UI in Settings → Church; shown in the header brand + sign-in.
- **#39 forgot password** — `request-password-reset` Edge Function (enumeration-safe,
  Resend via `_shared/email-templates/password-reset.ts`, logs to `email_log`);
  `/forgot-password` (neutral confirmation) and `/reset-password` (recovery-session
  detection → `updateUser`); `config.toml` adds the function (`verify_jwt = false`)
  and local `/reset-password` redirect URLs.

### #32 epic — done (P1–P5)

Per the spec `scheduling-rules-and-auto-scheduling.md`. Shipped as five phases;
proficiency kept at 2 levels (qualified/trainee), `requires_level` = `qualified` only.

- **P1** (b6fcc47, migration 0014): rule storage + manual-editing UI —
  `person_scheduling_prefs`, `person_recurring_unavailability`, `person_pairings`,
  `team_exclusions`, and position columns `min_count`/`max_count`/`requires_level`/
  `fill_priority`. One-off unavailability **reuses `blockout_dates`**.
  (`team_exclusions` and its UI were later removed entirely by #76, migration 0019.)
- **P2 #34** (migration 0015): pure `validateService()` (`validate-service.ts`,
  Vitest) + live red/amber badges on the plan People panel and Matrix + a two-tier
  publish gate logging overrides to **`publish_overrides`**. Hydrated by
  `use-service-state.ts`.
- **P3 #35**: deterministic `autoSchedule()` engine (`auto-scheduler.ts`) +
  "Suggest roster" preview dialog → editable `pending` draft.
- **P4 #36**: `rankCandidates()` + a "Replace…" action (`replace-dialog.tsx`) with
  ranked substitutes, reasons, and per-candidate month workload.
- **P5 #37**: a declined assignment's "Find replacement" opens the engine-ranked
  dialog (top flagged "Suggested"). The accept/decline **email** loop itself is the
  existing Phase-3 flow (`send-requests`/`respond-to-request`/`/respond/:token`) —
  P5 only feeds declines into the engine.

Decisions baked in: trainees count toward `min_count` (TRAINEE_UNSUPERVISED only
when a team is all-trainees); MULTI_POSITION always hard-errors; cadence is **hard**
in the auto-fill engine but a **warning** on a manual edit; `BELOW_REQUIRED_LEVEL`
folds into `NO_REQUIRED_LEVEL` at two proficiency levels. **Vitest** is now a
devDependency (`npm test`); the validator + engine have unit suites.

### #33 / #49 — Matrix team ordering (client-only)

`matrix-page.tsx` now sorts its team sections via a `sortedTeams` memo: a single
service-type filter uses `serviceTypeTeamSort` (the #31 per-type order, matching
the plan page); **All service types** uses a personal order from
`use-matrix-team-order.ts` (localStorage key `lscroster.matrixTeamOrder.<authUserId>`,
pure `applyTeamOrder` helper — new teams append, never hidden). The **Reorder
teams** popup (`matrix-team-order-dialog.tsx`) shows only in the All view and
supports **drag-and-drop** (dnd-kit, same idiom as the order-of-service reorder in
`plan-page.tsx`) plus up/down arrows as a touch/keyboard fallback. No schema, no
RLS, no migration; `applyTeamOrder` has a Vitest suite.

### #47 — partial accept of a roster suggestion (client-only)

`auto-schedule-dialog.tsx` (the #35 "Suggest roster" preview) now tracks a
`Set<string>` of ticked suggestion keys (`${positionId}-${personId}`), defaulting to
all. Each suggestion row and a select-all header use the new shadcn **`Checkbox`**
(`components/ui/checkbox.tsx`, radix-ui umbrella — already a dep; mirrors
`switch.tsx`'s `data-checked` convention, supports `indeterminate`). "Add N to plan"
applies only the ticked suggestions via the unchanged `useApplySuggestions`. Pair
the Checkbox with a sibling `<label htmlFor>` — do **not** nest the radix checkbox
button inside the label (the label re-forwards the click and cancels the toggle).

### #52 — schedules on the person page (client-only)

`person-schedule-card.tsx` (under `features/people`) lists a person's non-declined
services, split Past (most-recent first) / Upcoming (all, ascending), deduped to one
row per service date. The past-period dropdown ("Last 1 month" default / "Last 3
months" / "Last 6 services") trims only the past list. Data comes from the new
**person-keyed** `usePersonSchedule(personId)` in `use-assignments.ts` (key
`['person-schedule', personId]` — not the constant `mine` key; invalidated by
`useInvalidateAssignments`). `person-page.tsx` is now a two-column grid on `lg`
(Schedules left, the existing detail cards right; container widened to `max-w-5xl`);
the card shows for admins, leaders, and self. RLS already covers it (the same
policies My Schedule relies on).

## Open backlog (GitHub)

- **#27** — Service assignment acceptance email changes.
- **#19** — Member level access.
- **#9** — Rehearsal workflow.
- **#7** — Review keyboard shortcuts.
- **#6** — Define what "Team Leader" does. ⚠️ Do NOT reintroduce a per-team `is_leader`
  flag before #6 is resolved (it was reverted via #10).
- **#4** — More detail on the Teams screen.
- **#3** — Scheduling preferences on people (now largely subsumed by #32 P1).

Phase 5 (distribution) needs Manoj's confirmation before starting — see `PHASES.md`.

## How we work (project-specific reminders beyond CLAUDE.md)

- **Issue workflow:** implement → verify (build + local `db reset --local` + RLS probe
  with member JWT) → confirm with Manoj → **`db push` + `functions deploy` BEFORE
  `git push`** → merge `--no-ff` → close issue. One commit per issue + a separate docs commit.
- **Never** run destructive commands against linked **production** (`db reset`, drop
  table/column, delete buckets) without confirming with Manoj. Local Docker DB is fair game.
- Regenerate types via **bash, not PowerShell**:
  `npx supabase gen types typescript --local > src/types/database.ts`
  (PowerShell `>` writes UTF-16 and corrupts the file).
- Bash here-strings: don't use PowerShell `@'...'@`. For commit messages write to a
  temp file and `git commit -F`.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Production is a real church instance (~50 users). TS strict, no `any`, Zod at boundaries.
- Radix `Select` is not a native `<select>`; `preview_fill` can't set it — click by text via eval.

## Verification quickstart (local stack)

```
npx supabase start                 # Docker Desktop must be up; retry once if it wedges
npx supabase db reset --local      # rebuild from migrations
npx supabase gen types typescript --local > src/types/database.ts   # bash only
npm run build && npm run lint && npm run typecheck
npm run dev                        # then drive UI via preview_* tools
```

RLS probe: seed a member JWT and confirm member writes to the new rule tables → 403,
reads → 200, admin writes → success. Hidden buttons are not security.
