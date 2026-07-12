import { differenceInCalendarDays, parseISO } from 'date-fns'
import {
  conditionPhrase,
  personPositionKey,
  resolveRequirements,
  rulePositionDepths,
  type ConditionalRule,
  type EffectiveMinimum,
  type PersonRequirement,
  type ResolvedRequirements,
} from '@/features/scheduling/conditional-rules'
import {
  consecutiveRun,
  isUnavailableOn,
  type ValidationPerson,
  type ValidationProficiency,
} from '@/features/scheduling/validate-service'

/**
 * Auto-scheduler engine (issue #35, scheduling rules P3).
 *
 * A deterministic, client-side constraint solver. At one church's scale this is
 * a small problem, so it's plain TypeScript: expand the unfilled mandatory slots,
 * fill scarce/specialist positions first, build each slot's candidate pool by
 * applying every *hard* constraint against the in-progress roster, score the
 * survivors, and take the best. It produces an editable **draft** (suggested
 * `pending` assignments) — never a published roster — that the admin tweaks and
 * publishes through the P2 gate. Same inputs → same output.
 *
 * Cadence is treated as **hard** here (the engine won't breach `min_gap_days` /
 * `max_per_month` / `max_consecutive`), per the spec's Q1; on a *manual* edit it
 * stays a soft warning (see validate-service).
 */

export interface EnginePosition {
  id: string
  name: string
  teamId: string
  teamName: string
  minCount: number
  maxCount: number | null
  requiresLevel: ValidationProficiency | null
  /** Lower = fill first (scarce specialists). */
  fillPriority: number
}

/** A person the engine may schedule. Extends the validator's person context. */
export type EngineCandidate = ValidationPerson

export interface EngineAssignment {
  personId: string
  positionId: string
  teamId: string
}

export interface EnginePairing {
  personA: string
  personB: string
  kind: 'prefer' | 'avoid' | 'together'
  strength: 'hard' | 'soft'
}

export interface EngineState {
  service: { id: string; date: string; serviceTypeId: string }
  /** `minCount` is the base (team-default) minimum — see `planMinOverrides`. */
  positions: EnginePosition[]
  candidates: EngineCandidate[]
  /** Manual assignments already on the plan (non-declined occupy a slot). */
  existingAssignments: EngineAssignment[]
  pairings: EnginePairing[]
  /** Conditional relationship rules (issue #113); absent = none. */
  rules?: ConditionalRule[]
  /** Manual per-plan minimum overrides (issue #110) — they win over rules. */
  planMinOverrides?: ReadonlyMap<string, number>
  /** Rules muted on this plan. */
  mutedRuleIds?: ReadonlySet<string>
}

export interface Suggestion {
  personId: string
  personName: string
  positionId: string
  positionName: string
  teamId: string
  teamName: string
  /** A short human "why this person". */
  reason: string
}

export interface UnfilledSlot {
  positionId: string
  positionName: string
  teamName: string
  /** Which constraint emptied the pool. */
  reason: string
}

export interface EngineResult {
  suggestions: Suggestion[]
  unfilled: UnfilledSlot[]
}

export interface ScoringWeights {
  recency: number
  load: number
  prefPair: number
  cadence: number
}

/** Starting weights from the spec (tune later). */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  recency: 0.5,
  load: 0.3,
  prefPair: 0.1,
  cadence: 0.2,
}

// --- internal working roster -------------------------------------------------

interface WorkingAssignment {
  personId: string
  positionId: string
  teamId: string
  /** The level the person fills this slot at, for required-level coverage. */
  level: ValidationProficiency | undefined
}

const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)

/** Everyone set up for a position (has an eligibility row for it). */
function eligibleFor(state: EngineState, pos: EnginePosition): EngineCandidate[] {
  return state.candidates.filter((c) => pos.id in c.eligibility)
}

/** Services this person already serves in the plan's month (history only). */
function monthCount(person: EngineCandidate, date: string): number {
  return person.history.filter((h) => sameMonth(h.date, date)).length
}

/** Days since the person last served before `date` (Infinity if never). */
function daysSinceLastServed(person: EngineCandidate, date: string): number {
  const planDate = parseISO(date)
  let best = Infinity
  for (const h of person.history) {
    const d = differenceInCalendarDays(planDate, parseISO(h.date))
    if (d >= 0 && d < best) best = d
  }
  return best
}

// --- hard constraints --------------------------------------------------------

/** Why a candidate is excluded from a slot, or null if they qualify. */
function rejectionReason(
  person: EngineCandidate,
  pos: EnginePosition,
  state: EngineState,
  roster: WorkingAssignment[],
  needsQualified: boolean,
  sanctioned: ReadonlySet<string>,
): 'level' | 'unavailable' | 'inactive' | 'in-service' | 'avoid' | 'cadence' | null {
  const level = person.eligibility[pos.id]
  if (needsQualified && level !== 'qualified') return 'level'
  if (person.status !== 'active') return 'inactive'
  if (isUnavailableOn(person, state.service.date)) return 'unavailable'

  // No multi-position — except a slot a fired rule explicitly demands of this
  // person ("Sam leads AND plays guitar"); never the same slot twice.
  if (roster.some((r) => r.personId === person.id && r.positionId === pos.id)) return 'in-service'
  if (
    roster.some((r) => r.personId === person.id) &&
    !sanctioned.has(personPositionKey(person.id, pos.id))
  ) {
    return 'in-service'
  }

  // hard-avoid vs anyone already assigned
  const assignedIds = new Set(roster.map((r) => r.personId))
  for (const pr of state.pairings) {
    if (pr.kind !== 'avoid' || pr.strength !== 'hard') continue
    const other = pr.personA === person.id ? pr.personB : pr.personB === person.id ? pr.personA : null
    if (other && assignedIds.has(other)) return 'avoid'
  }

  // cadence (hard for auto-fill)
  if (person.minGapDays > 0) {
    const tooClose = person.history.some(
      (h) => Math.abs(differenceInCalendarDays(parseISO(state.service.date), parseISO(h.date))) <
        person.minGapDays,
    )
    if (tooClose) return 'cadence'
  }
  if (person.maxPerMonth != null && monthCount(person, state.service.date) + 1 > person.maxPerMonth) {
    return 'cadence'
  }
  if (person.maxConsecutive != null) {
    const run = consecutiveRun(
      state.service.date,
      person.history
        .filter((h) => h.serviceTypeId === state.service.serviceTypeId)
        .map((h) => h.date),
    )
    if (run > person.maxConsecutive) return 'cadence'
  }
  return null
}

const REASON_TEXT: Record<string, string> = {
  level: 'no qualified person is free',
  unavailable: 'everyone set up is unavailable',
  inactive: 'everyone set up is on a break',
  'in-service': 'everyone set up is already serving',
  avoid: 'remaining people are blocked by an avoid rule',
  cadence: 'everyone set up is over their serving limit',
}

// --- scoring -----------------------------------------------------------------

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function scoreCandidate(
  person: EngineCandidate,
  state: EngineState,
  roster: WorkingAssignment[],
  weights: ScoringWeights,
): { score: number; reason: string } {
  const recencyDays = daysSinceLastServed(person, state.service.date)
  const normRecency = recencyDays === Infinity ? 1 : clamp01(recencyDays / 84) // ~12 weeks
  const count = monthCount(person, state.service.date)
  const cap = person.targetPerMonth ?? person.maxPerMonth ?? count + 4
  const normHeadroom = clamp01((cap - count) / 4)

  const assignedIds = new Set(roster.map((r) => r.personId))
  const prefPair = state.pairings.some(
    (pr) =>
      pr.kind === 'prefer' &&
      ((pr.personA === person.id && assignedIds.has(pr.personB)) ||
        (pr.personB === person.id && assignedIds.has(pr.personA))),
  )

  // approaching the monthly cap → mild penalty (cadence is otherwise hard)
  const nearCap = person.maxPerMonth != null && count + 1 === person.maxPerMonth

  const score =
    weights.recency * normRecency +
    weights.load * normHeadroom +
    weights.prefPair * (prefPair ? 1 : 0) -
    weights.cadence * (nearCap ? 1 : 0)

  const reason = prefPair
    ? 'Serves well with someone already on this plan'
    : recencyDays === Infinity
      ? "Hasn't served recently"
      : recencyDays >= 28
        ? `Hasn't served in ${Math.floor(recencyDays / 7)} weeks`
        : 'Available and set up for this position'

  return { score, reason }
}

// --- the engine --------------------------------------------------------------

/** Requirements for the in-progress roster (rules re-fire as it grows). */
function resolveEngineRequirements(
  state: EngineState,
  roster: WorkingAssignment[],
): ResolvedRequirements {
  return resolveRequirements({
    serviceTypeId: state.service.serviceTypeId,
    positions: state.positions.map((p) => ({ id: p.id, minCount: p.minCount })),
    assignments: roster.map((r) => ({ personId: r.personId, positionId: r.positionId })),
    people: state.candidates,
    rules: state.rules ?? [],
    planMinOverrides: state.planMinOverrides,
    mutedRuleIds: state.mutedRuleIds,
  })
}

/** "— needed because Worship Leader is female (rule …)" for rule-raised slots. */
function ruleContext(eff: EffectiveMinimum, positions: EnginePosition[]): string {
  if (eff.source !== 'rule' || !eff.rule) return ''
  const phrase = conditionPhrase(
    eff.rule,
    (id) => positions.find((p) => p.id === id)?.name ?? 'another position',
  )
  return ` — needed because ${phrase} (rule "${eff.rule.name}")`
}

/** Person-specific "why they can't take the rule-required slot". */
const PERSON_REASON_TEXT: Record<string, string> = {
  level: "they don't fill it at the required level",
  unavailable: "they're unavailable that day",
  inactive: "they're on a break",
  'in-service': "they're already serving in another position",
  avoid: 'an avoid pairing blocks them',
  cadence: "they're over their serving limit",
}

export function autoSchedule(
  state: EngineState,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): EngineResult {
  const candidateById = new Map(state.candidates.map((c) => [c.id, c]))

  // Seed the working roster with the existing (manual) assignments.
  const roster: WorkingAssignment[] = state.existingAssignments.map((a) => ({
    ...a,
    level: candidateById.get(a.personId)?.eligibility[a.positionId],
  }))

  const suggestions: Suggestion[] = []
  const unfilled: UnfilledSlot[] = []

  // Conditional rules (issue #113) make the slot list dynamic: filling a
  // trigger position can change its targets' effective minimums. So instead of
  // expanding every slot up front, fill ONE slot at a time and re-resolve the
  // minimums after each decision. Rule targets sort after their triggers
  // (depth), so a target's requirement is known before it is considered;
  // within a depth the original scarcity → fill_priority → id order applies —
  // with no rules this degenerates to exactly the previous behaviour.
  const depths = rulePositionDepths(state.rules ?? [])
  // Slots we failed to fill, per position — excluded from re-expansion so the
  // loop always terminates (each iteration grows the roster or this map).
  const givenUp = new Map<string, number>()
  // Person-requirements we failed to satisfy (person+position keys).
  const givenUpReqs = new Set<string>()

  const positionById = new Map(state.positions.map((p) => [p.id, p]))

  /** Fill (or give up on) one unmet person-requirement — always progresses. */
  function fillPersonRequirement(req: PersonRequirement): void {
    const key = personPositionKey(req.personId, req.targetPositionId)
    const pos = positionById.get(req.targetPositionId)
    if (!pos) {
      givenUpReqs.add(key)
      return
    }
    const person = candidateById.get(req.personId)
    const personName =
      person?.name ??
      (req.rule.condition.kind === 'person' ? req.rule.condition.personName : undefined) ??
      'the required person'
    const describe = (why: string) =>
      `Rule "${req.rule.name}" needs ${personName} on ${pos.name}, but ${why}`

    if (!person || !(pos.id in person.eligibility)) {
      unfilled.push({
        positionId: pos.id,
        positionName: pos.name,
        teamName: pos.teamName,
        reason: describe("they're not set up for that position"),
      })
      givenUpReqs.add(key)
      return
    }
    const hasQualified = roster.some((r) => r.positionId === pos.id && r.level === 'qualified')
    const needsQualified = pos.requiresLevel === 'qualified' && !hasQualified
    // The requirement itself sanctions this pair, letting them hold it in
    // addition to the (trigger) position they may already occupy.
    const reject = rejectionReason(person, pos, state, roster, needsQualified, new Set([key]))
    if (reject) {
      unfilled.push({
        positionId: pos.id,
        positionName: pos.name,
        teamName: pos.teamName,
        reason: describe(PERSON_REASON_TEXT[reject] ?? "they can't take it"),
      })
      givenUpReqs.add(key)
      return
    }
    suggestions.push({
      personId: person.id,
      personName: person.name,
      positionId: pos.id,
      positionName: pos.name,
      teamId: pos.teamId,
      teamName: pos.teamName,
      reason:
        req.via === 'same-person'
          ? `Linked by rule "${req.rule.name}"`
          : `Named in rule "${req.rule.name}"`,
    })
    roster.push({
      personId: person.id,
      positionId: pos.id,
      teamId: pos.teamId,
      level: person.eligibility[pos.id],
    })
  }

  for (;;) {
    const resolved = resolveEngineRequirements(state, roster)
    const minimums = resolved.minimums

    // Fired person-requirements first — a pool of exactly one is the most
    // constrained slot there is, and satisfying it may fire further rules.
    const occupied = new Set(roster.map((r) => personPositionKey(r.personId, r.positionId)))
    const openReq = resolved.personRequirements
      .filter(
        (r) =>
          positionById.has(r.targetPositionId) &&
          !occupied.has(personPositionKey(r.personId, r.targetPositionId)) &&
          !givenUpReqs.has(personPositionKey(r.personId, r.targetPositionId)),
      )
      .sort(
        (a, b) =>
          (depths.get(a.targetPositionId) ?? 0) - (depths.get(b.targetPositionId) ?? 0) ||
          a.rule.id.localeCompare(b.rule.id) ||
          a.personId.localeCompare(b.personId),
      )
    if (openReq.length > 0) {
      fillPersonRequirement(openReq[0])
      continue
    }

    const open = state.positions
      .map((pos) => {
        const filled = roster.filter((r) => r.positionId === pos.id).length
        const eff = minimums.get(pos.id) ?? { min: pos.minCount, source: 'default' as const }
        return {
          pos,
          eff,
          needed: eff.min - filled - (givenUp.get(pos.id) ?? 0),
          poolSize: eligibleFor(state, pos).length,
        }
      })
      .filter((s) => s.needed > 0)
    if (open.length === 0) break

    open.sort(
      (a, b) =>
        (depths.get(a.pos.id) ?? 0) - (depths.get(b.pos.id) ?? 0) ||
        a.poolSize - b.poolSize ||
        a.pos.fillPriority - b.pos.fillPriority ||
        a.pos.id.localeCompare(b.pos.id),
    )
    const slot = open[0]
    const pos = slot.pos
    const hasQualified = roster.some(
      (r) => r.positionId === pos.id && r.level === 'qualified',
    )
    const needsQualified = pos.requiresLevel === 'qualified' && !hasQualified

    // Candidate pool: everyone eligible who passes every hard constraint.
    const rejections = new Set<string>()
    const pool: { person: EngineCandidate; score: number; reason: string }[] = []
    for (const person of eligibleFor(state, pos)) {
      const reject = rejectionReason(person, pos, state, roster, needsQualified, resolved.sanctioned)
      if (reject) {
        rejections.add(reject)
        continue
      }
      pool.push({ person, ...scoreCandidate(person, state, roster, weights) })
    }

    if (pool.length === 0) {
      const why =
        eligibleFor(state, pos).length === 0
          ? `No one is set up for ${pos.name}`
          : REASON_TEXT[[...rejections][0]] ?? 'No one is available'
      unfilled.push({
        positionId: pos.id,
        positionName: pos.name,
        teamName: pos.teamName,
        reason: why + ruleContext(slot.eff, state.positions),
      })
      givenUp.set(pos.id, (givenUp.get(pos.id) ?? 0) + 1)
      continue
    }

    // Best score wins; deterministic tiebreak by person id.
    pool.sort((a, b) => b.score - a.score || a.person.id.localeCompare(b.person.id))
    const pick = pool[0]
    suggestions.push({
      personId: pick.person.id,
      personName: pick.person.name,
      positionId: pos.id,
      positionName: pos.name,
      teamId: pos.teamId,
      teamName: pos.teamName,
      reason: pick.reason,
    })
    roster.push({
      personId: pick.person.id,
      positionId: pos.id,
      teamId: pos.teamId,
      level: pick.person.eligibility[pos.id],
    })
  }

  return { suggestions, unfilled }
}

export interface RankedCandidate {
  personId: string
  personName: string
  /** The level this person fills the position at. */
  level: ValidationProficiency
  score: number
  /** Short "why this person". */
  reason: string
  /** Services this person already serves in the plan's month (workload). */
  monthCount: number
}

/**
 * Rank the eligible, rule-passing substitutes for one position — the data behind
 * explainability, the "replace" menu, and decline re-suggestions (P4/P5). Same
 * hard constraints and scoring as the auto-fill, evaluated against the roster
 * with `exclude`d people removed (e.g. the person being replaced). Highest score
 * first; deterministic tiebreak by id.
 */
export function rankCandidates(
  state: EngineState,
  positionId: string,
  options: { exclude?: string[]; weights?: ScoringWeights } = {},
): RankedCandidate[] {
  const pos = state.positions.find((p) => p.id === positionId)
  if (!pos) return []
  const exclude = new Set(options.exclude ?? [])
  const weights = options.weights ?? DEFAULT_WEIGHTS
  const candidateById = new Map(state.candidates.map((c) => [c.id, c]))

  const roster: WorkingAssignment[] = state.existingAssignments
    .filter((a) => !exclude.has(a.personId))
    .map((a) => ({ ...a, level: candidateById.get(a.personId)?.eligibility[a.positionId] }))

  const hasQualified = roster.some((r) => r.positionId === pos.id && r.level === 'qualified')
  const needsQualified = pos.requiresLevel === 'qualified' && !hasQualified
  const { sanctioned } = resolveEngineRequirements(state, roster)

  const ranked: RankedCandidate[] = []
  for (const person of eligibleFor(state, pos)) {
    if (exclude.has(person.id)) continue
    if (rejectionReason(person, pos, state, roster, needsQualified, sanctioned)) continue
    const { score, reason } = scoreCandidate(person, state, roster, weights)
    ranked.push({
      personId: person.id,
      personName: person.name,
      level: person.eligibility[pos.id],
      score,
      reason,
      monthCount: monthCount(person, state.service.date),
    })
  }
  ranked.sort((a, b) => b.score - a.score || a.personId.localeCompare(b.personId))
  return ranked
}
