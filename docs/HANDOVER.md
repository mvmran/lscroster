# Session handover — LSCRoster

_Last updated: 2026-06-15_

This is a working handover note for continuing development in a fresh Claude Code
session. Read `CLAUDE.md` first for the project rules; this file captures only the
**live state** that isn't obvious from the repo.

## Current state of the tree

- Branch `main`, clean, synced with `origin/main` at **`b6fcc47`**.
- Production (lscroster.xyz) is **up to date**: migrations through **0014** applied,
  no Edge Function changes pending, Vercel auto-deployed from `main`.
- Schema since Phase 4: migrations **0006–0014** (see `supabase/migrations/`).

## What just shipped (last two work sessions)

All implemented, verified on the local stack (build + lint + typecheck + RLS probe
with a member JWT), deployed to prod, and merged to `main`.

| Issue | What | Status |
|---|---|---|
| #29 | Publish emails include the song **Meter** from the Default arrangement | closed |
| #30 | Position **proficiency / eligibility** (`team_member_positions.proficiency` enum qualified/trainee) + manual editing UI | closed |
| #31 | **Order** a service type's required teams; plans list teams in that order (`service_type_teams.sort_order`, migration 0013) | closed |
| #32 | **Scheduling rules — Phase 1 only** (storage + manual-editing UI). Migration 0014. | **OPEN — intentionally** |

### #32 is a 5-phase epic; only P1 is done

Per the attached spec `scheduling-rules-and-auto-scheduling.md`. We confirmed with
Manoj to ship **P1 only** and keep proficiency at 2 levels (qualified/trainee).

**P1 shipped (storage + UI):**
- Migration 0014 added tables `person_scheduling_prefs`, `person_recurring_unavailability`,
  `person_pairings`, `team_exclusions`; enums `scheduling_status`, `pairing_kind`,
  `pairing_strength`; and position columns `min_count`, `max_count`, `requires_level`
  (`check in ('qualified')`), `fill_priority` + `positions_count_range` check.
- One-off unavailability **reuses the existing `blockout_dates` table** (we did NOT
  create the spec's `person_unavailability` — single source of truth).
- UI: `PersonSchedulingCard` (person page, admin/leader only), `TeamExclusionsDialog`
  (Teams page header), `PositionRequirementsDialog` (per position on team page).
- Hooks in `src/features/scheduling/use-scheduling-rules.ts`.

**NOT built yet — P2–P5 (the actual value):**
- **P2 (keystone):** shared `validateService()` validator + live badges + publish gate.
- **P3:** auto-scheduler engine → produces an editable draft.
- **P4:** explainability (why each person was chosen).
- **P5:** confirm/decline via Resend email flow.

Suggested approach (offered, not yet agreed): split P2–P5 into their own issues so each
stays shippable. Natural next step = **P2**.

## Open backlog (GitHub)

- **#32** — scheduling rules P2–P5 (see above).
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
