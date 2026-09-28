# Design — Team Access merge (Leader / Scheduler / Viewer)

**Status:** scoping. **Branch:** `worktree-access-control-rework`.
This is section #3 of the access-control rework (see [ACCESS-CONTROL.md](ACCESS-CONTROL.md)).

## Goal

Replace the two separate per-team grants (**Team Leader**, **Team Viewer**) with
a **single graded grant** of three ordered levels, chosen from one dropdown
against each team, in **one "Team Access" card** on the person page (and the
mirror card on the team page). A member's capability is then the sum of two
cards: **Team Access** (per-team, this doc) and **Permissions** (church-wide BAU,
already shipped). The two stay separate cards — they answer different questions
("which teams, and how much" vs "what church-wide jobs") — but are designed to
read as one system.

### The three levels

| Level | See members & positions | Add/remove members, edit positions | Schedule members to plans & email them | View the team's plans/roster (incl. drafts) |
|---|:---:|:---:|:---:|:---:|
| **Viewer** | ✅ | ⛔ | ⛔ | ✅ (read-only) |
| **Scheduler** *(new)* | ✅ | ⛔ | ✅ | ✅ |
| **Leader** | ✅ | ✅ | ✅ | ✅ |

Ordered: **Leader ⊃ Scheduler ⊃ Viewer**. This is the *manage / roster / view*
split floated in PHASES. Admins and coordinators hold **Leader** on every team
implicitly (via `is_admin_or_coordinator()`), so grants are only ever needed for
members.

The new middle tier splits today's single `can_manage_team()` into two jobs:

- **manage** (Leader only) — team membership and position structure.
- **schedule** (Scheduler + Leader) — plan assignments, per-plan targets,
  rule-mutes, and the request/cancellation emails.

## Data model

New enum and one table replacing the two:

```sql
create type team_access as enum ('viewer', 'scheduler', 'leader');  -- ordered

create table team_grants (
  team_id   uuid not null references teams(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  access    team_access not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, person_id)
);
```

One row per (team, person) — a person has at most one level per team, which is
exactly what a single dropdown expresses. (Enum order lets us compare with
`>=` if useful, e.g. `access >= 'scheduler'`.)

### Data migration (in the same migration file)

```
insert into team_grants (team_id, person_id, access)
  select team_id, person_id, 'leader' from team_leaders
union
  select team_id, person_id, 'viewer' from team_viewers
on conflict (team_id, person_id) do update
  set access = greatest-by-order(excluded.access, team_grants.access);  -- leader wins
drop table team_leaders, team_viewers;   -- cascades their indexes/triggers
```

Anyone who is **both** a leader and a viewer of the same team today (two tables
allow it) collapses to the higher level (**leader**). Re-runnable-on-fresh holds:
earlier migrations create `team_leaders`/`team_viewers`, this one migrates and
drops them; no later migration references them.

## RLS helpers to redefine / add

All are `security definer`. Names in **bold** are new.

| Helper | New definition | Used by |
|---|---|---|
| `leads_team(t)` | grant level `leader` on `t` | manage policies |
| **`schedules_team(t)`** | grant level `scheduler` or `leader` on `t` | assignment/mute policies |
| `views_team(t)` | any grant on `t` (viewer+) | roster read |
| `can_manage_team(t)` | `is_admin_or_coordinator() or leads_team(t)` | team_members, positions, team_member_positions |
| **`can_schedule_team(t)`** | `is_admin_or_coordinator() or schedules_team(t)` | plan_assignments write, min counts |
| `is_viewer_of_plan(p)` | any grant on a team on plan `p` | plan/children read |
| `leads_team_on_plan(p)` → **`schedules_team_on_plan(p)`** | scheduler+ of a team serving the plan's service type | plan visibility + rule-mutes |
| `leads_any_team()` → **`schedules_any_team()`** | holds scheduler+ on any team | scheduling-prefs read (0046) |
| `can_view_contact(t-member)` | **must be redefined** — it currently joins `team_leaders` (migration 0044) | contact visibility |

**Decision D1:** does **Scheduler** get contact-detail visibility (email/phone)
like Leader, or stay masked? Emailing goes through the system (service role), so
a scheduler doesn't strictly need raw addresses — but seeing them is convenient.
Recommend: contact visible to **scheduler + leader** (anyone who can schedule the
team). Flag to confirm.

## RLS policies to re-point

| Table | Today | After |
|---|---|---|
| `team_members` (write) | `can_manage_team` | `can_manage_team` (now Leader-only for members) |
| `positions` (write) | `can_manage_team` | `can_manage_team` |
| `team_member_positions` (write) | `can_manage_team` | `can_manage_team` |
| `plan_assignments` (write) | `can_manage_team` | **`can_schedule_team`** |
| `plan_position_min_counts` (write) | `can_manage_team` | **`can_schedule_team`** — *Decision D2* |
| `plan_rule_mutes` (write) | `is_admin_or_coordinator() or leads_team_on_plan` (0047) | `… or schedules_team_on_plan` |
| `plans`/`plan_items`/`plan_times`/`plan_attachments` (read) | `… or is_viewer_of_plan` | unchanged (helper now = any grant) |
| `plan_assignments` (read) | `… or views_team` | unchanged (helper now = any grant) |
| `team_grants` itself | — | read: authenticated; write: `is_admin_or_coordinator()` (governance appoints; grantees can't) |

**Decision D2:** per-plan min counts — Scheduler-settable (recommended: it's a
rostering target) or Leader-only (team structure)? Recommend Scheduler.

## Edge Functions

- `_shared/auth.ts` — `teamScopeFor()` returns a manage predicate today; split
  into **`canSchedule`** (send/cancel requests) and, if any function needs it,
  `canManage`. `getLedTeamIds()` → query `team_grants` filtered by level.
  Admins **and coordinators** already short-circuit to all (from 0047).
- `send-requests`, `cancel-assignment` — gate on **schedule** level (Scheduler +
  Leader + governance), not manage.
- `_shared/roster-status.ts` — the digest reads `team_leaders`+`team_viewers`
  for recipients; switch to `team_grants`. **Decision D3:** who receives the
  digest — every grant level (as today, leaders + viewers) or only schedulers/
  leaders? Recommend: all grant-holders (unchanged reach).

## Frontend

- **New `use-team-access.ts`** — replace the `team_leaders`/`team_viewers`
  split (`useTeamLeaders`, `useTeamViewers`, `useMyLedTeams`, `useMyViewedTeams`,
  `usePersonLedTeams`, `usePersonViewedTeams`, `useTeamLeaderMutations`,
  `useTeamViewerMutations`) with grant-level-aware equivalents over `team_grants`
  (one `useMyTeamGrants` returning a `Map<teamId, level>`; one set-level / clear
  mutation). Expose `canManageTeam` (leader+gov), **`canScheduleTeam`**
  (scheduler+), `canViewTeam` (any).
- **Merge the two profile cards** (`person-team-grants-card.tsx`, currently
  rendered twice with `kind="leader"|"viewer"`) into **one "Team Access" card**:
  a row per granted team with a **level dropdown** (None / Viewer / Scheduler /
  Leader), plus "Add teams". Same treatment on the team page
  (`team-grants-card.tsx`, `team-page.tsx`).
- `person-page.tsx` — replace the two `<PersonTeamGrantsCard kind=…>` with one
  `<TeamAccessCard>`.
- **Consumers of the old capability checks:**
  - `guards.tsx` `RequireMatrixAccess` — uses `ledTeamIds`; matrix entry should
    now be for **schedulers+** → use `canScheduleTeam`/`schedules_any_team`.
  - `services-page.tsx` `canMatrix` — `perms.ledTeamIds.size > 0` → schedules-any.
  - `scheduling-panel.tsx` — `canManageTeam` for roster edits and rule-mutes →
    should be `canScheduleTeam`; membership-only bits (if any) stay manage.
  - `matrix-page.tsx` — `canManageAny` (`ledTeamIds`) and bulk-email gating →
    schedule level.
  - `bulk-email-dialog.tsx` — email is a schedule action.

## Audit

`audit_log` (0028) has `audit_team_leaders_aid` / `audit_team_viewers_aid`
triggers. Replace with a `team_grants` trigger recording grant **add / remove /
level-change** (insert / delete / update). Old triggers drop with the tables.

## Types & verification

- Regenerate `src/types/database.ts` from local after the migration.
- DB-level probes (as we've done): a Viewer can read but not schedule; a
  Scheduler can assign + email but not add members; a Leader can do both; a
  plain member none; and coordinators/admins keep full access everywhere.
- `npm run ci` (incl. Deno function check/tests, since `_shared/auth.ts` and the
  functions change).

## Upgrade note (for UPGRADE.md when shipped)

Grants are preserved: every Team Leader becomes **Leader**, every Team Viewer
becomes **Viewer**, someone who was both becomes **Leader**. No access changes on
upgrade; the new **Scheduler** level is opt-in. `db push` + `functions deploy`
before the bundle, as always.

## Decisions needed before building

- **D1** — Contact visibility for **Scheduler**: visible (recommended) or masked?
- **D2** — Per-plan min counts: Scheduler-settable (recommended) or Leader-only?
- **D3** — Roster-status digest recipients: all grant levels (recommended) or
  schedulers/leaders only?
- **D4** — UI labels: "Viewer / Scheduler / Leader" and card name "Team Access"
  (assumed from your note) — confirm wording.

## Suggested phasing

1. **DB** — enum + `team_grants`, data migration, redefine helpers, re-point
   policies, drop old tables + `can_view_contact`/audit fixes. Verify with probes.
2. **Edge Functions** — `teamScopeFor` split, send/cancel, roster-status.
3. **Frontend** — new hooks, then the merged Team Access card, then re-point the
   scattered `canManage/led` consumers. Regenerate types, `npm run ci`.

Each phase is independently testable; 1 must land before 2/3 compile against the
new schema.
