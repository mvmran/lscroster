import { addDays, differenceInCalendarDays, getDate, getDay, parseISO } from 'date-fns'

/**
 * Shared scheduling-rules validator (issue #34, scheduling rules P2).
 *
 * One pure function over a fully-loaded service state — no I/O. It is the single
 * source of truth for (a) live badges while hand-editing a roster, (b) the
 * publish gate, and later (c) the auto-scheduler's post-fill check. Callers
 * hydrate the data (TanStack Query) and pass it in; never duplicate rule logic.
 *
 * Maps the spec's constraint taxonomy onto LSCRoster's actual schema. Decisions
 * baked in for this church's two-level proficiency model:
 *  - Trainees DO count toward `min_count`; `TRAINEE_UNSUPERVISED` fires only when
 *    *all* of a team's assignees in the service are trainees.
 *  - `MULTI_POSITION` is always a hard error (no "allow multiple positions" toggle).
 *  - `requires_level` is `qualified`-only, checked as coverage (`NO_REQUIRED_LEVEL`):
 *    the position needs at least one qualified person present. The per-assignee
 *    `BELOW_REQUIRED_LEVEL` code folds into this + `TRAINEE_UNSUPERVISED` while
 *    proficiency has two levels; it can return when a `lead` level lands.
 *  - One-off unavailability reads `blockout_dates`; recurring reads
 *    `person_recurring_unavailability`.
 */

export type Severity = 'error' | 'warning'

/** Short labels for badges; the full sentence lives in `RuleResult.message`. */
export const RULE_SHORT_LABELS: Record<string, string> = {
  NOT_ELIGIBLE: 'Not set up',
  BELOW_REQUIRED_LEVEL: 'Below level',
  UNAVAILABLE_SCHEDULED: 'Unavailable',
  MULTI_POSITION: 'Double-booked',
  AVOID_PAIR_TOGETHER: 'Avoid pair',
  SOFT_AVOID_TOGETHER: 'Avoid pair',
  INACTIVE_SCHEDULED: 'On a break',
  MANDATORY_UNFILLED: 'Understaffed',
  NO_REQUIRED_LEVEL: 'Needs qualified',
  TRAINEE_UNSUPERVISED: 'Unsupervised',
  OVER_CADENCE: 'Too frequent',
  MAX_CONSECUTIVE: 'Too many in a row',
  UNDER_TARGET: 'Below target',
}

export interface RuleResult {
  /** A code from the taxonomy (e.g. 'UNAVAILABLE_SCHEDULED'). */
  code: string
  severity: Severity
  /** Human-readable, e.g. "Sarah is unavailable on 6 Jul". */
  message: string
  /** Position the result attaches to (for highlighting a slot). */
  positionId?: string
  /** People involved (for highlighting). */
  personIds?: string[]
}

export type AssignmentStatus = 'pending' | 'confirmed' | 'declined'
export type ValidationProficiency = 'qualified' | 'trainee'
export type PersonStatus = 'active' | 'break' | 'pending'

export interface ValidationPosition {
  id: string
  name: string
  teamId: string
  teamName: string
  /** Mandatory when >= 1. */
  minCount: number
  /** null = unlimited. */
  maxCount: number | null
  /** null, or a floor level the position needs at least one of. */
  requiresLevel: ValidationProficiency | null
}

export interface ValidationAssignment {
  personId: string
  positionId: string
  teamId: string
  status: AssignmentStatus
}

export interface ValidationPerson {
  id: string
  name: string
  /** From `person_scheduling_prefs.status`; absent prefs → 'active'. */
  status: PersonStatus
  /** Min days between services (0 = no constraint). */
  minGapDays: number
  maxPerMonth: number | null
  targetPerMonth: number | null
  maxConsecutive: number | null
  /** positionId → the level this person fills it at (their eligibility). */
  eligibility: Record<string, ValidationProficiency>
  /** One-off unavailability ranges (inclusive, 'YYYY-MM-DD'). */
  blockouts: { start: string; end: string }[]
  /** Recurring unavailability rules. */
  recurringUnavailability: { weekOfMonth: number | null; weekday: number }[]
  /**
   * The person's *other* scheduled (non-declined) service dates, for cadence /
   * consecutive / per-month checks. Excludes this plan.
   */
  history: { date: string; serviceTypeId: string }[]
}

export interface ValidationPairing {
  personA: string
  personB: string
  kind: 'prefer' | 'avoid' | 'together'
  strength: 'hard' | 'soft'
}

export interface ServiceState {
  service: { id: string; date: string; serviceTypeId: string }
  /** Positions of the teams that serve this plan. */
  positions: ValidationPosition[]
  /** Current draft assignments on this plan. */
  assignments: ValidationAssignment[]
  /** Context for every person referenced by an assignment. */
  people: ValidationPerson[]
  pairings: ValidationPairing[]
}

// --- small, individually-testable date helpers -------------------------------

/** Which week of its month a date falls in (1..5). */
export function weekOfMonth(date: Date): number {
  return Math.ceil(getDate(date) / 7)
}

/** Is this the last occurrence of its weekday in the month? */
export function isLastWeekdayOfMonth(date: Date): boolean {
  return addDays(date, 7).getMonth() !== date.getMonth()
}

/** Does a recurring-unavailability rule match a given date? */
export function matchesRecurring(
  rule: { weekOfMonth: number | null; weekday: number },
  date: Date,
): boolean {
  if (rule.weekday !== getDay(date)) return false
  if (rule.weekOfMonth == null) return true
  if (rule.weekOfMonth === -1) return isLastWeekdayOfMonth(date)
  return rule.weekOfMonth === weekOfMonth(date)
}

/** Is a person unavailable on a date (one-off range or recurring rule)? */
export function isUnavailableOn(person: ValidationPerson, isoDate: string): boolean {
  if (person.blockouts.some((b) => b.start <= isoDate && b.end >= isoDate)) {
    return true
  }
  const date = parseISO(isoDate)
  return person.recurringUnavailability.some((r) => matchesRecurring(r, date))
}

// --- internal context --------------------------------------------------------

/** Assignments that actually occupy a slot — declined people aren't serving. */
function scheduled(state: ServiceState): ValidationAssignment[] {
  return state.assignments.filter((a) => a.status !== 'declined')
}

function peopleById(state: ServiceState): Map<string, ValidationPerson> {
  return new Map(state.people.map((p) => [p.id, p]))
}

function nameOf(people: Map<string, ValidationPerson>, id: string): string {
  return people.get(id)?.name ?? 'Someone'
}

const SHORT_DATE = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

// --- per-rule checks (each pure and independently testable) -------------------

/** NOT_ELIGIBLE — assignee lacks a `team_member_positions` row for the slot. */
export function checkEligibility(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const positions = new Map(state.positions.map((p) => [p.id, p]))
  const results: RuleResult[] = []
  for (const a of scheduled(state)) {
    const person = people.get(a.personId)
    if (person && !(a.positionId in person.eligibility)) {
      const pos = positions.get(a.positionId)
      results.push({
        code: 'NOT_ELIGIBLE',
        severity: 'error',
        message: `${nameOf(people, a.personId)} isn't set up for ${pos?.name ?? 'this position'}.`,
        positionId: a.positionId,
        personIds: [a.personId],
      })
    }
  }
  return results
}

/** UNAVAILABLE_SCHEDULED — scheduled on a date the person is unavailable. */
export function checkAvailability(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const date = state.service.date
  const results: RuleResult[] = []
  for (const id of uniquePersonIds(state)) {
    const person = people.get(id)
    if (person && isUnavailableOn(person, date)) {
      results.push({
        code: 'UNAVAILABLE_SCHEDULED',
        severity: 'error',
        message: `${person.name} is unavailable on ${SHORT_DATE(date)}.`,
        personIds: [id],
      })
    }
  }
  return results
}

/** INACTIVE_SCHEDULED — a person on a break / pending is scheduled. */
export function checkInactive(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const results: RuleResult[] = []
  for (const id of uniquePersonIds(state)) {
    const person = people.get(id)
    if (person && person.status !== 'active') {
      const label = person.status === 'break' ? 'on a break' : 'not yet active'
      results.push({
        code: 'INACTIVE_SCHEDULED',
        severity: 'error',
        message: `${person.name} is ${label} but is scheduled.`,
        personIds: [id],
      })
    }
  }
  return results
}

/** MULTI_POSITION — one person fills more than one position in the service. */
export function checkMultiPosition(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const positions = new Map(state.positions.map((p) => [p.id, p]))
  const byPerson = new Map<string, Set<string>>()
  for (const a of scheduled(state)) {
    ;(byPerson.get(a.personId) ?? byPerson.set(a.personId, new Set()).get(a.personId)!).add(
      a.positionId,
    )
  }
  const results: RuleResult[] = []
  for (const [personId, positionIds] of byPerson) {
    if (positionIds.size > 1) {
      const names = [...positionIds].map((id) => positions.get(id)?.name ?? '?').join(', ')
      results.push({
        code: 'MULTI_POSITION',
        severity: 'error',
        message: `${nameOf(people, personId)} is scheduled in ${positionIds.size} positions (${names}).`,
        personIds: [personId],
      })
    }
  }
  return results
}

/** AVOID_PAIR_TOGETHER / SOFT_AVOID_TOGETHER — an avoid pair both scheduled. */
export function checkPairings(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const present = new Set(uniquePersonIds(state))
  const results: RuleResult[] = []
  for (const pair of state.pairings) {
    if (pair.kind !== 'avoid') continue
    if (present.has(pair.personA) && present.has(pair.personB)) {
      const hard = pair.strength === 'hard'
      results.push({
        code: hard ? 'AVOID_PAIR_TOGETHER' : 'SOFT_AVOID_TOGETHER',
        severity: hard ? 'error' : 'warning',
        message: `${nameOf(people, pair.personA)} and ${nameOf(people, pair.personB)} are set to avoid serving together.`,
        personIds: [pair.personA, pair.personB],
      })
    }
  }
  return results
}

/**
 * MANDATORY_UNFILLED + NO_REQUIRED_LEVEL — per-position coverage.
 * Trainees count toward `min_count`; a `requires_level` position needs at least
 * one qualified person present.
 */
export function checkCoverage(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const byPosition = new Map<string, ValidationAssignment[]>()
  for (const a of scheduled(state)) {
    ;(byPosition.get(a.positionId) ?? byPosition.set(a.positionId, []).get(a.positionId)!).push(a)
  }
  const results: RuleResult[] = []
  for (const pos of state.positions) {
    const filled = byPosition.get(pos.id) ?? []
    if (pos.minCount >= 1 && filled.length < pos.minCount) {
      results.push({
        code: 'MANDATORY_UNFILLED',
        severity: 'error',
        message:
          filled.length === 0
            ? `${pos.name} needs ${pos.minCount} but nobody is scheduled yet.`
            : `${pos.name} needs ${pos.minCount} but only ${filled.length} scheduled.`,
        positionId: pos.id,
      })
    }
    if (pos.requiresLevel && (pos.minCount >= 1 || filled.length > 0)) {
      const hasQualified = filled.some(
        (a) => people.get(a.personId)?.eligibility[pos.id] === 'qualified',
      )
      if (!hasQualified) {
        results.push({
          code: 'NO_REQUIRED_LEVEL',
          severity: 'error',
          message: `${pos.name} needs a qualified person.`,
          positionId: pos.id,
          personIds: filled.map((a) => a.personId),
        })
      }
    }
  }
  return results
}

/**
 * TRAINEE_UNSUPERVISED — a team is staffed only by trainees this service.
 * Fires per team when there's >= 1 trainee assignee and no qualified one.
 */
export function checkSupervision(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const teamName = new Map(state.positions.map((p) => [p.teamId, p.teamName]))
  // Per team: collect the level each assignee fills their slot at.
  const byTeam = new Map<string, { personId: string; level: ValidationProficiency | undefined }[]>()
  for (const a of scheduled(state)) {
    const level = people.get(a.personId)?.eligibility[a.positionId]
    ;(byTeam.get(a.teamId) ?? byTeam.set(a.teamId, []).get(a.teamId)!).push({
      personId: a.personId,
      level,
    })
  }
  const results: RuleResult[] = []
  for (const [teamId, members] of byTeam) {
    const trainees = members.filter((m) => m.level === 'trainee')
    const hasQualified = members.some((m) => m.level === 'qualified')
    if (trainees.length > 0 && !hasQualified) {
      results.push({
        code: 'TRAINEE_UNSUPERVISED',
        severity: 'warning',
        message: `${teamName.get(teamId) ?? 'A team'} has trainees but no qualified person to supervise.`,
        personIds: [...new Set(trainees.map((t) => t.personId))],
      })
    }
  }
  return results
}

/**
 * OVER_CADENCE, MAX_CONSECUTIVE, UNDER_TARGET — per-person workload, from the
 * person's other scheduled service dates. All soft (warnings) on a manual edit.
 */
export function checkCadence(state: ServiceState): RuleResult[] {
  const people = peopleById(state)
  const planDate = parseISO(state.service.date)
  const results: RuleResult[] = []
  for (const id of uniquePersonIds(state)) {
    const person = people.get(id)
    if (!person) continue

    // OVER_CADENCE — minimum gap to any other service.
    if (person.minGapDays > 0) {
      const tooClose = person.history.find(
        (h) => Math.abs(differenceInCalendarDays(planDate, parseISO(h.date))) < person.minGapDays,
      )
      if (tooClose) {
        results.push({
          code: 'OVER_CADENCE',
          severity: 'warning',
          message: `${person.name} is scheduled again within ${person.minGapDays} days (also ${SHORT_DATE(tooClose.date)}).`,
          personIds: [id],
        })
      }
    }

    // Per-calendar-month count (this plan + history in the same month).
    const monthCount =
      1 + person.history.filter((h) => sameMonth(h.date, state.service.date)).length
    if (person.maxPerMonth != null && monthCount > person.maxPerMonth) {
      results.push({
        code: 'OVER_CADENCE',
        severity: 'warning',
        message: `${person.name} is over their cap of ${person.maxPerMonth}/month (${monthCount} this month).`,
        personIds: [id],
      })
    }
    if (person.targetPerMonth != null && monthCount < person.targetPerMonth) {
      results.push({
        code: 'UNDER_TARGET',
        severity: 'warning',
        message: `${person.name} is below their target of ${person.targetPerMonth}/month (${monthCount} so far).`,
        personIds: [id],
      })
    }

    // MAX_CONSECUTIVE — longest run of back-to-back same-service-type dates
    // (weekly adjacency) that includes this plan. Approximate by design; the
    // engine refines it later.
    if (person.maxConsecutive != null) {
      const run = consecutiveRun(
        state.service.date,
        person.history
          .filter((h) => h.serviceTypeId === state.service.serviceTypeId)
          .map((h) => h.date),
      )
      if (run > person.maxConsecutive) {
        results.push({
          code: 'MAX_CONSECUTIVE',
          severity: 'warning',
          message: `${person.name} would serve ${run} services in a row (max ${person.maxConsecutive}).`,
          personIds: [id],
        })
      }
    }
  }
  return results
}

// --- helpers shared by the checks --------------------------------------------

function uniquePersonIds(state: ServiceState): string[] {
  return [...new Set(scheduled(state).map((a) => a.personId))]
}

function sameMonth(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 7) === isoB.slice(0, 7)
}

/**
 * Length of the consecutive run of weekly service dates that includes
 * `planDate`. "Consecutive" = each step <= 8 days apart (a weekly-cadence
 * approximation; fortnightly/monthly services rarely trip it, which is fine for
 * a soft warning).
 */
export function consecutiveRun(planDate: string, historyDates: string[]): number {
  const dates = [...new Set([planDate, ...historyDates])].sort()
  const index = dates.indexOf(planDate)
  let run = 1
  for (let i = index; i > 0; i--) {
    if (differenceInCalendarDays(parseISO(dates[i]), parseISO(dates[i - 1])) <= 8) run++
    else break
  }
  for (let i = index; i < dates.length - 1; i++) {
    if (differenceInCalendarDays(parseISO(dates[i + 1]), parseISO(dates[i])) <= 8) run++
    else break
  }
  return run
}

// --- the one validator -------------------------------------------------------

const CHECKS = [
  checkEligibility,
  checkAvailability,
  checkInactive,
  checkMultiPosition,
  checkPairings,
  checkCoverage,
  checkSupervision,
  checkCadence,
]

export function validateService(state: ServiceState): {
  errors: RuleResult[]
  warnings: RuleResult[]
} {
  const results = CHECKS.flatMap((check) => check(state))
  return {
    errors: results.filter((r) => r.severity === 'error'),
    warnings: results.filter((r) => r.severity === 'warning'),
  }
}

/** The most severe level among a set of results (errors win). */
export function worstSeverity(results: RuleResult[]): Severity | null {
  if (results.some((r) => r.severity === 'error')) return 'error'
  if (results.length > 0) return 'warning'
  return null
}
