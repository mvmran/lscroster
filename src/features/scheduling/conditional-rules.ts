/**
 * Conditional relationship rules (issue #113) — the shared, pure resolver.
 *
 * A rule says: "if the person assigned to <trigger position> matches
 * <attribute = value>, then <target position(s)> need <min> people". Rules are
 * floors layered into the same effective-minimum indirection the validator and
 * auto-scheduler already read. Precedence per (plan, position), highest wins:
 *
 *   1. manual per-plan override (`plan_position_min_counts`) — an explicit
 *      human decision on that plan always beats a rule;
 *   2. fired rules — several firing on one target resolve to the max;
 *   3. the team default (`positions.min_count`).
 *
 * No ELSE branch: the "else" case is a second rule, and the base minimum is
 * the "no rule fired" default. Evaluation is over the whole roster, so the
 * validator has no ordering problem; only the engine sequences fills (see
 * `rulePositionDepths`). Design notes: docs/DESIGN-conditional-rules.md.
 */

export type RuleStrength = 'hard' | 'soft'
/** Widen alongside the DB CHECK constraint when new attributes land. */
export type RuleAttribute = 'sex'

export interface RuleEffect {
  targetPositionId: string
  minCount: number
}

export interface ConditionalRule {
  id: string
  name: string
  /** null = applies to every service type. */
  serviceTypeId: string | null
  triggerPositionId: string
  triggerAttribute: RuleAttribute
  triggerValue: string
  strength: RuleStrength
  enabled: boolean
  effects: RuleEffect[]
}

/** The slice of a person the condition evaluator reads. */
export interface RulePerson {
  id: string
  sex?: 'male' | 'female' | null
}

/** The attribute accessor — the one place a `RuleAttribute` is interpreted. */
export function attributeValue(person: RulePerson, attribute: RuleAttribute): string | null {
  switch (attribute) {
    case 'sex':
      return person.sex ?? null
  }
}

export const ATTRIBUTE_LABELS: Record<RuleAttribute, string> = { sex: 'sex' }

/**
 * How a rule stands against the current roster:
 *  - fired: a trigger assignee matches the condition; effects apply.
 *  - dormant: nobody (non-declined) is in the trigger position yet.
 *  - unmatched: trigger assignees are known and none match.
 *  - unevaluable: no assignee matches, and at least one has the attribute
 *    unrecorded — the rule *might* apply, we can't tell (data-hygiene nudge).
 *  - muted: turned off for this plan.
 */
export type RuleStatus = 'fired' | 'dormant' | 'unmatched' | 'unevaluable' | 'muted'

export interface RuleEvaluation {
  rule: ConditionalRule
  status: RuleStatus
  /** Matching trigger assignees (fired) or those missing the attribute (unevaluable). */
  personIds: string[]
}

export interface EffectiveMinimum {
  min: number
  source: 'plan-override' | 'rule' | 'default'
  /** The binding rule when source is 'rule' (highest min; hard beats soft on ties). */
  rule?: ConditionalRule
}

export interface ResolveInput {
  serviceTypeId: string
  /** Positions serving the plan, with their base (team-default) minimum. */
  positions: { id: string; minCount: number }[]
  /** Non-declined assignments on the plan. */
  assignments: { personId: string; positionId: string }[]
  people: RulePerson[]
  rules: ConditionalRule[]
  /** Manual per-plan overrides (issue #110) — they win over rules. */
  planMinOverrides?: ReadonlyMap<string, number>
  mutedRuleIds?: ReadonlySet<string>
}

export interface ResolvedRequirements {
  /** positionId → effective minimum with provenance. Every input position has an entry. */
  minimums: Map<string, EffectiveMinimum>
  /** One entry per rule applicable to this plan (any status), for chips/messages. */
  evaluations: RuleEvaluation[]
}

export function resolveRequirements(input: ResolveInput): ResolvedRequirements {
  const positionIds = new Set(input.positions.map((p) => p.id))
  const peopleById = new Map(input.people.map((p) => [p.id, p]))
  const muted = input.mutedRuleIds ?? new Set<string>()

  const evaluations: RuleEvaluation[] = []
  // positionId → candidate mins from fired rules
  const firedMins = new Map<string, { min: number; rule: ConditionalRule }[]>()

  for (const rule of input.rules) {
    if (!rule.enabled) continue
    if (rule.serviceTypeId != null && rule.serviceTypeId !== input.serviceTypeId) continue
    if (!positionIds.has(rule.triggerPositionId)) continue
    const effects = rule.effects.filter((e) => positionIds.has(e.targetPositionId))
    if (effects.length === 0) continue

    if (muted.has(rule.id)) {
      evaluations.push({ rule, status: 'muted', personIds: [] })
      continue
    }

    const assignees = input.assignments.filter((a) => a.positionId === rule.triggerPositionId)
    if (assignees.length === 0) {
      evaluations.push({ rule, status: 'dormant', personIds: [] })
      continue
    }

    const matched: string[] = []
    const unknown: string[] = []
    for (const a of assignees) {
      const person = peopleById.get(a.personId)
      const value = person ? attributeValue(person, rule.triggerAttribute) : null
      if (value === rule.triggerValue) matched.push(a.personId)
      else if (value == null) unknown.push(a.personId)
    }

    if (matched.length > 0) {
      evaluations.push({ rule, status: 'fired', personIds: matched })
      for (const e of effects) {
        const arr = firedMins.get(e.targetPositionId) ?? []
        arr.push({ min: e.minCount, rule })
        firedMins.set(e.targetPositionId, arr)
      }
    } else if (unknown.length > 0) {
      evaluations.push({ rule, status: 'unevaluable', personIds: unknown })
    } else {
      evaluations.push({ rule, status: 'unmatched', personIds: [] })
    }
  }

  const minimums = new Map<string, EffectiveMinimum>()
  for (const pos of input.positions) {
    const override = input.planMinOverrides?.get(pos.id)
    if (override != null) {
      minimums.set(pos.id, { min: override, source: 'plan-override' })
      continue
    }
    const candidates = firedMins.get(pos.id)
    if (candidates && candidates.length > 0) {
      // Highest floor wins; on ties a hard rule outranks a soft one (its
      // severity should label the unmet result), then rule id for determinism.
      candidates.sort(
        (a, b) =>
          b.min - a.min ||
          (a.rule.strength === b.rule.strength ? 0 : a.rule.strength === 'hard' ? -1 : 1) ||
          a.rule.id.localeCompare(b.rule.id),
      )
      minimums.set(pos.id, { min: candidates[0].min, source: 'rule', rule: candidates[0].rule })
      continue
    }
    minimums.set(pos.id, { min: pos.minCount, source: 'default' })
  }

  return { minimums, evaluations }
}

// --- rule graph helpers (cycles + engine fill order) --------------------------

function ruleEdges(rules: ConditionalRule[]): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>()
  for (const rule of rules) {
    if (!rule.enabled) continue
    const targets = edges.get(rule.triggerPositionId) ?? new Set<string>()
    for (const e of rule.effects) {
      if (e.targetPositionId !== rule.triggerPositionId) targets.add(e.targetPositionId)
    }
    edges.set(rule.triggerPositionId, targets)
  }
  return edges
}

/**
 * Position ids forming a trigger→target cycle among the given rules, or null.
 * Run at authoring time (existing rules + the candidate) so cycles are
 * rejected with a named loop before they're ever stored.
 */
export function findRuleCycle(rules: ConditionalRule[]): string[] | null {
  const edges = ruleEdges(rules)
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  function visit(node: string): string[] | null {
    const s = state.get(node)
    if (s === 'done') return null
    if (s === 'visiting') return stack.slice(stack.indexOf(node)).concat(node)
    state.set(node, 'visiting')
    stack.push(node)
    for (const next of edges.get(node) ?? []) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(node, 'done')
    return null
  }

  for (const node of edges.keys()) {
    const cycle = visit(node)
    if (cycle) return cycle
  }
  return null
}

/**
 * Fill-order depth per position for the engine: a rule's targets fill after
 * its trigger, so by the time a target slot is considered the trigger is
 * decided and the effective minimum is known. Positions not in any rule are
 * depth 0. Cycles (which authoring rejects) are broken defensively by
 * ignoring the closing edge.
 */
export function rulePositionDepths(rules: ConditionalRule[]): Map<string, number> {
  const edges = ruleEdges(rules)
  const depths = new Map<string, number>()

  function depthOf(node: string, path: Set<string>): number {
    const known = depths.get(node)
    if (known != null) return known
    if (path.has(node)) return 0 // defensive cycle break
    path.add(node)
    let d = 0
    for (const [trigger, targets] of edges) {
      if (targets.has(node)) d = Math.max(d, depthOf(trigger, path) + 1)
    }
    path.delete(node)
    depths.set(node, d)
    return d
  }

  for (const [trigger, targets] of edges) {
    depthOf(trigger, new Set())
    for (const t of targets) depthOf(t, new Set())
  }
  return depths
}

// --- display helpers -----------------------------------------------------------

const VALUE_LABELS: Record<string, string> = { male: 'male', female: 'female' }

export function ruleValueLabel(value: string): string {
  return VALUE_LABELS[value] ?? value
}

/**
 * A read-only sentence for lists/chips, e.g.
 * "If Worship Leader is female → Male Vocals ≥ 2, Female Vocals ≥ 1".
 */
export function ruleSentence(
  rule: ConditionalRule,
  positionName: (id: string) => string,
): string {
  const effects = rule.effects
    .map((e) => `${positionName(e.targetPositionId)} ≥ ${e.minCount}`)
    .join(', ')
  return `If ${positionName(rule.triggerPositionId)} is ${ruleValueLabel(rule.triggerValue)} → ${effects}`
}
