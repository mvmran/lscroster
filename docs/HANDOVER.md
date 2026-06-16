# Session handover — LSCRoster

_Last updated: 2026-06-16_

This is a working handover note for continuing development in a fresh Claude Code
session. Read `CLAUDE.md` first for the project rules; this file captures only the
**live state** that isn't obvious from the repo.

## Current state of the tree

- Branch `main`, clean, synced with `origin/main` (latest merge: **#33 + #49**,
  Matrix team ordering — see below; before that, **`60c7254`** the #32 P2–P5 merge).
- Production (lscroster.xyz) is **up to date**: migrations through **0015** applied,
  no Edge Function changes pending, Vercel auto-deployed from `main`.
- Schema since Phase 4: migrations **0006–0015** (see `supabase/migrations/`).
  #33/#49 added **no** schema — client-only render order + localStorage.

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

### #32 epic — done (P1–P5)

Per the spec `scheduling-rules-and-auto-scheduling.md`. Shipped as five phases;
proficiency kept at 2 levels (qualified/trainee), `requires_level` = `qualified` only.

- **P1** (b6fcc47, migration 0014): rule storage + manual-editing UI —
  `person_scheduling_prefs`, `person_recurring_unavailability`, `person_pairings`,
  `team_exclusions`, and position columns `min_count`/`max_count`/`requires_level`/
  `fill_priority`. One-off unavailability **reuses `blockout_dates`**.
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
