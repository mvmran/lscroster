# Design: Conditional relationship rules between roster assignments

Status: **approved & implemented** (migration 0037, 2026-07-11) — §7's
recommendations were all accepted. Kept as the design record; the shipped
summary lives in the project's internal build notes (migration 0037).
Tracks GitHub issue [#113](https://github.com/mvmran/lscroster/issues/113)
("Additional per plan scheduling rules"). Written 2026-07-11 after a research
pass over the scheduling engine; intended as session context for the
implementation sessions, alongside the project's internal build notes.

The feature: a general mechanism for **"if ⟨condition on the person assigned
to position A⟩ then ⟨headcount constraint on position(s) B…⟩"**. Canonical
example: *if the Worship Leader is female, require 2 on Male Vocals and 1 on
Female Vocals; if male, the reverse.*

---

## 1. How scheduling rules work today (research summary)

### Data model

| Table / column | Role |
|---|---|
| `people` | `first_name`, `last_name`, `email`, `role`, `phone`, `photo_url`, `birthday`, `status`, `notes`. **No sex/gender and no generic attribute mechanism** — the trigger attribute for the canonical rule does not exist yet. |
| `teams`, `positions` | `positions` carries the per-position requirements: `min_count` (mandatory when ≥ 1), `max_count`, `requires_level` (`'qualified'` or null), `fill_priority` (lower = fill first). Added by migration 0014. |
| `team_members` + `team_member_positions` | Eligibility: who may fill which position, at `proficiency` `qualified`/`trainee`. (NB issue #99 proposes removing proficiency — this design does not couple to it.) |
| `plan_assignments` | One person in one position on one plan; `status` pending/confirmed/declined. Declined rows don't occupy a slot. |
| `person_scheduling_prefs` | Per-person cadence: `min_gap_days`, `max_per_month`, `target_per_month`, `max_consecutive`, `status` (active/break/pending). |
| `person_pairings` | prefer/avoid/together × **`pairing_strength` enum (`hard`/`soft`)** — the existing precedent for per-rule hard-vs-soft. |
| `plan_position_min_counts` (+ template twin) | Issue #110: per-plan override of a position's minimum. Effective min = `coalesce(plan override, positions.min_count)`, computed client-side. **This is the key mechanism the new feature composes with: a conditional rule is essentially a *dynamic* min-count override.** |
| `publish_overrides` | Audit rows when a leader publishes despite a violation; errors require a typed reason. This is the existing escape hatch that makes "hard" rules safe to enforce. |

### Evaluation

Everything is **client-side, pure TypeScript**, hydrated by TanStack Query:

- **`validate-service.ts`** — one pure `validateService(state)` over a fully
  loaded `ServiceState` → `{errors, warnings}` of `RuleResult {code, severity,
  message, positionId?, personIds?}`. Single source of truth for (a) live
  badges while editing, (b) the publish gate, (c) the engine's semantics.
  Checks: eligibility, availability, inactive, multi-position, avoid pairs,
  coverage (`MANDATORY_UNFILLED`, `NO_REQUIRED_LEVEL`), trainee supervision,
  cadence. Hard = `error` (blocks publish unless overridden with a typed
  reason); soft = `warning`.
- **`auto-scheduler.ts`** — deterministic greedy solver. Expands unfilled
  mandatory slots (`min_count − filled` per position), sorts slots by
  *pool scarcity → fill_priority → position id*, then per slot: filter
  candidates through every hard constraint (`rejectionReason`: level,
  inactive, unavailable, already-in-service, hard-avoid, cadence), score the
  survivors (`ScoringWeights` — recency 0.5, load 0.3, prefPair 0.1, cadence
  0.2), take the best, append to the working roster. Produces a **draft**
  (pending assignments). `rankCandidates` reuses the same pool+scoring for
  the replace menu.
- **Hydration** — `use-service-state.ts` (`useSchedulingRulesData`,
  `buildPersonContextMaps`, `buildPlanValidation`) and `use-auto-scheduler.ts`
  (`buildEngineState`) share the same person-context maps, so validator and
  engine can't drift. Any new rule type must be added to
  `SchedulingRulesData` and both builders.

Two properties matter for this feature:

1. **Validation has no sequencing problem.** `validateService` sees the whole
   roster at once, so "does the rule fire?" is just a lookup over current
   assignments. Only the *engine* has an ordering question.
2. **Effective-min is already an indirection.** Coverage checks and slot
   expansion both read a computed per-position minimum, not the raw column.
   Conditional rules slot in as one more layer in that computation.

---

## 2. Proposed data model

### 2a. The trigger attribute: `people.sex`

The rule engine needs an attribute on the person to condition on. Two options:

- **(A) Typed column, `people.sex`** — nullable enum `('male','female')`,
  set on the person form. One migration, trivial UI, unambiguous semantics.
  Each future attribute (e.g. "youth", "can drive") is another migration.
- **(B) Generic tags** — `people.tags text[]` (or a `person_attributes`
  table) with conditions of the form "has tag X". One mechanism covers every
  future attribute, but nothing enforces exactly-one-of male/female, tag
  vocabulary needs curation UI, and typos become silent rule failures.

**Recommendation: (A) now, with a rule schema that doesn't care.** The rule
row stores `trigger_attribute` (v1: only `'sex'` allowed by a CHECK
constraint) + `trigger_value`. Adding tags later means widening the check and
teaching the condition evaluator one more attribute source — no rule-schema
migration. This gets the real rule shipped without building an attribute
platform for hypothetical rules.

### 2b. Rule storage: two new tables (+ regenerated types + Zod)

No jsonb — the codebase is consistently typed-columns + generated types, and
FK integrity matters here (deleting a position must clean up its rules).

```
conditional_rules
  id                uuid PK
  name              text          -- human label, e.g. "Vocals balance"
  service_type_id   uuid FK service_types, null = all types
  trigger_position_id uuid FK positions ON DELETE CASCADE
  trigger_attribute text CHECK (trigger_attribute IN ('sex'))
  trigger_value     text          -- e.g. 'female'
  strength          pairing_strength NOT NULL DEFAULT 'hard'   -- reuse enum
  enabled           boolean NOT NULL DEFAULT true
  created_at / updated_at

conditional_rule_effects
  id                 uuid PK
  rule_id            uuid FK conditional_rules ON DELETE CASCADE
  target_position_id uuid FK positions ON DELETE CASCADE
  min_count          integer NOT NULL CHECK (min_count >= 0)
  UNIQUE (rule_id, target_position_id)

plan_rule_mutes                    -- per-plan "turn this rule off here"
  plan_id  uuid FK plans ON DELETE CASCADE
  rule_id  uuid FK conditional_rules ON DELETE CASCADE
  PK (plan_id, rule_id)
```

RLS mirrors the other scheduling-rules tables: authenticated read,
`is_admin_or_leader()` manage (rules span teams, so per-team
`can_manage_team` scoping doesn't fit; same call as `person_pairings`).

Design decisions baked in:

- **No IF/THEN/ELSE.** Issue #113 asks for ELSE, but an ELSE is just a second
  rule (exactly how Manoj phrased Rule A / Rule B). Base `min_count` is the
  "no rule fired" default. Two condition→effects rows are simpler to store,
  display, and reason about than a branching structure.
- **Min-count effects only in v1.** The validator doesn't even check
  `max_count` today, and #113's examples are all minimums. `max_count`
  effects (and with them, genuine min>max contradictions) are a follow-up.
- **Service-type scope instead of template-stored rules.** #113 says "saved
  on template", but the intent is "every new plan gets the rules" — a rule
  scoped to a service type achieves that with zero copy/drift machinery.
  "Editable on plan" is covered by `plan_rule_mutes` plus the existing
  per-plan min steppers (see precedence below).

### 2c. Precedence: who sets a position's effective minimum

For a (plan, position), highest wins **top-down**:

1. **Manual per-plan override** (`plan_position_min_counts`) — an explicit
   human decision on that plan always wins; the UI shows "overriding rule X".
2. **Fired conditional rules** — if several fire on the same target, take the
   **max** of their minimums (they're floors; the most demanding satisfies
   all).
3. **Team default** (`positions.min_count`).

The resolver returns provenance (`'plan-override' | ruleId | 'default'`) so
badges and steppers can explain themselves.

---

## 3. Evaluation semantics

### 3a. A new pure resolver, shared by validator and engine

New module `conditional-rules.ts` (sibling of `validate-service.ts`):

```
resolveRequirements(assignments, people, positions, rules, mutes)
  → per position: { effectiveMin, source }
  → firedRules[]      (rule + trigger person, for messages)
  → dormantRules[]    (trigger position unfilled — rule waiting)
  → unevaluable[]     (trigger filled but person's attribute is null)
```

Condition semantics: a rule **fires** when *any* non-declined assignee of the
trigger position matches `trigger_attribute = trigger_value`. (Trigger
positions are usually single-person; if two people with different attributes
are assigned, both rules fire and max-wins resolves it.) A trigger person
whose attribute is unset fires nothing and lands in `unevaluable`.

### 3b. Validator integration

- `checkCoverage` reads the resolver's `effectiveMin` instead of the raw
  min-override map.
- When the binding minimum came from a rule, emit a **new code**
  `CONDITIONAL_MIN_UNFILLED` (severity = rule's `strength`; hard→error,
  soft→warning) with a rule-attributed message rather than the generic
  `MANDATORY_UNFILLED`:
  > *Male Vocals needs 2 when the Worship Leader is female (rule "Vocals
  > balance") — only 1 scheduled.*
- New warning `RULE_UNEVALUATED` for the unevaluable case:
  > *Can't check rule "Vocals balance" — Sarah's sex isn't recorded.*
- Dormant rules produce **no result** (no noise while the trigger is empty);
  the plan page can show a passive "1 rule waiting on Worship Leader" chip.
- Hard rules remain publishable via the existing `publish_overrides` typed-
  reason flow — no new escape hatch needed. Add the new codes to
  `RULE_SHORT_LABELS`.

### 3c. Engine integration (the sequencing question)

The greedy engine assigns slot-by-slot, so a rule's target minimum can change
mid-run when the trigger position gets filled. Two mechanisms, both needed:

1. **Fill triggers first.** Before the existing sort (scarcity →
   fill_priority → id), order positions by a **topological sort of the rule
   graph** (edge: trigger position → target position). Trigger slots are
   decided before any slot they influence, so by the time a target is
   considered its effective minimum is known. Positions not in any rule keep
   today's order among themselves.
2. **Re-expand after trigger assignments.** After the engine (or a
   pre-existing manual assignment) fills a trigger position, recompute
   `resolveRequirements` against the working roster and append any newly
   required target slots to the remaining queue. Effects only *add* floors,
   so this converges in at most one re-expansion per rule — no fixpoint loop.

If the trigger can't be filled (empty pool), its rules stay dormant and
targets fill to base minimums — deterministic, and the validator will say why.
The engine never *removes* assignments: if a fired rule lowers a target's
minimum below what's already assigned, that's not an error (floors, not
exact counts); a future max-effect would surface it as a warning.

`rankCandidates` (replace menu) needs no change: swapping the trigger person
re-runs validation live, and the badges re-explain the new state.

### 3d. Conflicts, cascades, cycles

- **Same target, multiple fired rules:** max of minimums (floors compose).
  With min-only effects, genuine contradictions are impossible.
- **Cascades** (rule B's trigger is rule A's target): allowed — the topo sort
  handles chains naturally.
- **Cycles** (A's trigger → B's target and vice versa): rejected at
  **authoring time** with a DFS over the position graph and a plain message
  ("This rule would create a loop: Worship Leader → Male Vocals → Worship
  Leader"). Cheap, and it keeps the engine loop-free by construction. The
  resolver also skips cycles defensively at runtime (belt-and-braces for
  rules edited via the API).

### 3e. Fairness / rotation interaction

None by design. Rules change *how many* slots exist, never *who scores what*
— recency/load/prefPair scoring and cadence limits are untouched. Who is
eligible for "Male Vocals" remains an eligibility question
(`team_member_positions`), not a rule question. Second-order effects are
inherent and acceptable: a fired rule consumes one more person, which can
surface more `UNDER_TARGET`/unfilled elsewhere; trigger positions filling
earlier can shift which scarce specialist gets first pick (mitigated: triggers
sort among themselves by the existing scarcity key).

---

## 4. Authoring UX

### Option 1 — Structured sentence builder (recommended)

A dialog composing one sentence from dropdowns, matching the existing
team-page position dialog patterns:

> **If** [Worship Leader ▾] **is filled by someone whose** [sex ▾] **is**
> [female ▾], **then require** [2 ▾] **on** [Male Vocals ▾]
> ［+ add another position］

- Only positions of teams serving the rule's service type are listed; the
  cycle check runs on save; a live preview shows which upcoming plans the
  rule would currently fire on.
- Pros: invalid rules are nearly impossible to author; zero syntax to learn
  (Sunday-morning-proof, working rule #9); stores straight into the typed
  tables. Cons: most UI work; each new condition type (tags, numeric ops) is
  a UI addition — but that cost is real in *any* option.

### Option 2 — Text DSL (issue #113's literal ask)

`IF Worship.Vocals.Sex="Female" THEN Worship.Vocals.Min=2` parsed into the
same tables. Pros: compact, fast for a power user, trivially copy-pasteable
between churches. Cons: a parser plus good error messages is real work;
position names become load-bearing strings (rename a position, break the
rule); quoting/typos fail at authoring or — worse — silently; the audience is
non-technical church admins. Highest error-proneness of the three.

### Option 3 — Preset templates

Canned patterns ("gender-balance rule") with blanks to fill. Lowest effort
and lowest risk, but every new pattern is a code change — it abandons the
"general mechanism" goal.

**Recommendation: Option 1**, with the rule list rendering each saved rule as
a read-only sentence (which incidentally looks like Option 2's DSL, giving
the confirmation-readability of the DSL without its parser). Rules UI lives
under **Teams → Rules** (or Settings → Scheduling rules); the plan page gets
a compact chip per active/dormant rule with a mute toggle
(`plan_rule_mutes`) and provenance tooltips on the min steppers.

---

## 5. Edge cases and their answers

| Case | Behaviour |
|---|---|
| Circular rule chain | Rejected at save with a named loop; resolver also breaks cycles at runtime. |
| Rule unsatisfiable with available people | Engine reports the slot in `unfilled` with rule attribution ("Male Vocals needs 2 because the Worship Leader is female — no eligible person is free"); publish still possible via typed-reason override. |
| Trigger position not yet assigned | Rule dormant; base minimums apply; passive "waiting" chip, no error. |
| Trigger person's attribute unset | `RULE_UNEVALUATED` warning naming person + attribute (doubles as data-hygiene nudge). |
| Trigger assignee declines | Declined rows don't count as scheduled → rule un-fires automatically on the next validation pass. |
| Two rules, same target | Max of minimums. |
| Rules across teams | Supported natively — rules are service-type-scoped and reference positions directly; the validator already loads all serving teams' positions. Authoring filters targets to teams serving that service type; if team↔service-type mappings change later, the resolver skips now-invalid targets with a warning. |
| Manual per-plan min stepper vs fired rule | Manual override wins; UI notes it's overriding rule X. |
| Multiple assignees in trigger position | "Any assignee matches" fires the rule; conflicting fires resolve by max. |
| Position deleted / renamed | FKs cascade effects and rules away (delete); renames are safe because rules store ids, not names — a point against the DSL option. |

---

## 6. Implementation map (for the build session — no code yet)

1. **Migration 0037**: `people.sex` enum column; `conditional_rules`,
   `conditional_rule_effects`, `plan_rule_mutes` + RLS + triggers; regenerate
   types (local stack); Zod schemas at the form boundary.
2. **`conditional-rules.ts`**: pure `resolveRequirements` + cycle check +
   unit tests (the codebase already tests validator/engine this way).
3. **`validate-service.ts`**: coverage check consumes the resolver;
   new codes `CONDITIONAL_MIN_UNFILLED`, `RULE_UNEVALUATED` + short labels.
4. **`auto-scheduler.ts`**: topo-sorted fill order + post-trigger
   re-expansion; rule-attributed unfilled reasons; tests for chains,
   dormant triggers, determinism.
5. **Hydration**: `useAllConditionalRules()` in `use-scheduling-rules.ts`;
   wire into `SchedulingRulesData`, `buildPlanValidation`,
   `buildEngineState`.
6. **UI**: person-form sex field; rule-builder dialog + rules list; plan-page
   rule chips + mute; min-stepper provenance tooltips.
7. Build-notes entry under post-Phase-4 enhancements; close #113 on ship.

Nothing here breaks an existing instance on upgrade (new tables + one
nullable column; no renamed columns or changed email links), so no special
migration path beyond the standard `db push` ordering.

---

## 7. Decision points for Manoj (recommendations inline)

1. **Attribute model** — typed `people.sex` column now, generic tags later if
   a non-sex rule actually materialises (recommended), or build tags first?
2. **Default strength** — `hard` by default (recommended: understaffing is
   already an error today, and `publish_overrides` is the escape hatch), with
   per-rule soft available. Or default soft?
3. **Per-plan editability** — mute toggle + existing min steppers
   (recommended) satisfies #113's "editable on plan" without per-plan rule
   copies. Or do you want full per-plan rule editing?
4. **Scope** — service-type-level rules instead of #113's literal
   "saved on template" (recommended; same outcome, no copy/drift). OK?
5. **Effects** — min-count only in v1, max-count later (recommended)?

---

## 8. Extension (2026-07-12): person conditions, person effects, cross-team mirror

Approved and shipped as migration 0038 the day after v1. Everything below was
implemented against the v1 architecture unchanged — same resolver indirection,
same precedence, same chips.

**Generalised shape.** Conditions and effects became discriminated unions:

    condition = attribute(sex=…) | person(<id>) | any
    effect    = count(target, ≥N) | person(target, <id>) | same-person(target)

One rule holds one condition and a mixed effect list ("if WL is Sam → Sam on
Guitar, Sharon on Keys, ≥2 Female Vocals"). `any` + `same-person` is the
cross-team mirror ("whoever leads worship also runs Foldback"). Cross-team
needed **no schema change** — rules were never team-scoped, only
position-scoped.

**Person requirements are checks, not writes (decision: Manoj).** A fired
person/same-person effect emits a `personRequirement` (person P must hold
position Y). Nothing auto-inserts assignments: the validator flags
`CONDITIONAL_PERSON_MISSING` at the rule's strength, the engine fills the
pool-of-one slot during Suggest roster, and the plan page offers a one-click
"Add P" button. Rejected: full mirror auto-linking (hidden writes fight the
request-email/token lifecycle) and blocking the triggering assignment (no
write-time gates anywhere in the app).

**Sanctioned double-booking.** Fired requirements yield sanctioned
(person, position) pairs. `checkMultiPosition` and the engine's `in-service`
rejection exempt exactly those pairs: Sam may hold WL + Guitar, a third
un-sanctioned position still errors, and if the trigger changes the sanction
evaporates and the stale rows surface as an ordinary double-booking.

**Fairness counts once per service (decision: Manoj).** History dedupes by
plan, so a rule-linked double counts as one serve for min-gap / max-per-month /
consecutive / scoring. Request emails stay one-per-assignment-row for now
(decision: Manoj) — combining into one email per person is a follow-up.

**Referential integrity.** Person FKs are `ON DELETE SET NULL`; a null ref
makes the rule **broken**: it stops firing, the plan chip goes red
("needs attention"), and the rules card explains ("person was removed — edit
or delete"). The card also warns when a referenced person is inactive or no
longer set up for the position. DB CHECKs enforce per-kind shape; partial
unique indexes allow "≥2 on Vocals AND Sam on Vocals" in one rule.
