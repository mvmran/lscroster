import { useMemo } from 'react'
import { fullName } from '@/features/people/person-utils'
import { usePlanAssignments, type AssignmentWithPerson } from '@/features/scheduling/use-assignments'
import { useBlockouts } from '@/features/scheduling/use-blockouts'
import {
  toConditionalRule,
  useAllConditionalRules,
  useAllPairings,
  useAllPersonPrefs,
  useAllPlanMinCounts,
  useAllPlanRuleMutes,
  useAllRecurringUnavailability,
  useRosteredDates,
} from '@/features/scheduling/use-scheduling-rules'
import {
  teamServesType,
  useAllPositions,
  useAllTeamMembers,
  useTeams,
} from '@/features/scheduling/use-teams'
import type { ResolvedRequirements } from '@/features/scheduling/conditional-rules'
import {
  resolveStateRequirements,
  validateService,
  type RuleResult,
  type ServiceState,
  type ValidationPerson,
  type ValidationPosition,
  type ValidationProficiency,
} from '@/features/scheduling/validate-service'
import type { PlanWithType } from '@/features/services/use-plans'

export interface PlanValidation {
  errors: RuleResult[]
  warnings: RuleResult[]
  /** errors + warnings, for cheap per-slot/per-person lookups. */
  all: RuleResult[]
  isPending: boolean
}

const EMPTY: PlanValidation = { errors: [], warnings: [], all: [], isPending: true }

/**
 * The cross-plan data the validator needs for *any* plan, loaded once from the
 * shared caches. The per-plan assignment list is supplied separately (the plan
 * page has it, the matrix already fetches all plans' assignments in one query).
 */
export interface SchedulingRulesData {
  isPending: boolean
  data: {
    teams: ReturnType<typeof useTeams>['data']
    positions: ReturnType<typeof useAllPositions>['data']
    members: ReturnType<typeof useAllTeamMembers>['data']
    blockouts: ReturnType<typeof useBlockouts>['data']
    prefs: ReturnType<typeof useAllPersonPrefs>['data']
    recurring: ReturnType<typeof useAllRecurringUnavailability>['data']
    pairings: ReturnType<typeof useAllPairings>['data']
    history: ReturnType<typeof useRosteredDates>['data']
    /** Per-plan minimum-required overrides (issue #110). */
    minCounts: ReturnType<typeof useAllPlanMinCounts>['data']
    /** Conditional relationship rules + per-plan mutes (issue #113). */
    conditionalRules: ReturnType<typeof useAllConditionalRules>['data']
    ruleMutes: ReturnType<typeof useAllPlanRuleMutes>['data']
  }
}

export function useSchedulingRulesData(): SchedulingRulesData {
  const teams = useTeams()
  const positions = useAllPositions()
  const members = useAllTeamMembers()
  const blockouts = useBlockouts()
  const prefs = useAllPersonPrefs()
  const recurring = useAllRecurringUnavailability()
  const pairings = useAllPairings()
  const history = useRosteredDates()
  const minCounts = useAllPlanMinCounts()
  const conditionalRules = useAllConditionalRules()
  const ruleMutes = useAllPlanRuleMutes()

  const isPending =
    teams.isPending ||
    positions.isPending ||
    members.isPending ||
    blockouts.isPending ||
    prefs.isPending ||
    recurring.isPending ||
    pairings.isPending ||
    history.isPending ||
    minCounts.isPending ||
    conditionalRules.isPending ||
    ruleMutes.isPending

  return {
    isPending,
    data: {
      teams: teams.data,
      positions: positions.data,
      members: members.data,
      blockouts: blockouts.data,
      prefs: prefs.data,
      recurring: recurring.data,
      pairings: pairings.data,
      history: history.data,
      minCounts: minCounts.data,
      conditionalRules: conditionalRules.data,
      ruleMutes: ruleMutes.data,
    },
  }
}

/** The plan's conditional rules + muted set, mapped for the resolver. */
export function planRuleContext(
  planId: string,
  data: Pick<SchedulingRulesData['data'], 'conditionalRules' | 'ruleMutes'>,
): { rules: ReturnType<typeof toConditionalRule>[]; mutedRuleIds: Set<string> } {
  return {
    rules: (data.conditionalRules ?? []).map(toConditionalRule),
    mutedRuleIds: new Set(
      (data.ruleMutes ?? []).filter((m) => m.plan_id === planId).map((m) => m.rule_id),
    ),
  }
}

/**
 * The effective minimum-required per position for one plan: the per-plan
 * override (issue #110) when present, else the team-wide `positions.min_count`.
 */
export function planMinCountMap(
  planId: string,
  minCounts: SchedulingRulesData['data']['minCounts'],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of minCounts ?? []) {
    if (m.plan_id === planId) map.set(m.position_id, m.min_count)
  }
  return map
}

/**
 * Per-person rule context, indexed by person id. Shared by the validator
 * (assigned people) and the auto-scheduler (every eligible candidate) so both
 * read identical eligibility / availability / history semantics.
 */
export interface PersonContextMaps {
  eligibility: Map<string, Record<string, ValidationProficiency>>
  prefs: Map<string, NonNullable<SchedulingRulesData['data']['prefs']>[number]>
  blockouts: Map<string, { start: string; end: string }[]>
  recurring: Map<string, { weekOfMonth: number | null; weekday: number }[]>
  /** Other (non-declined) service dates, excluding `excludePlanId`. */
  history: Map<string, { date: string; serviceTypeId: string }[]>
  /** Rule trigger attribute (issue #113); missing = unrecorded. */
  sex: Map<string, 'male' | 'female' | null>
}

export function buildPersonContextMaps(
  data: SchedulingRulesData['data'],
  excludePlanId: string,
): PersonContextMaps {
  const eligibility = new Map<string, Record<string, ValidationProficiency>>()
  const sex = new Map<string, 'male' | 'female' | null>()
  for (const m of data.members ?? []) {
    const rec = eligibility.get(m.person_id) ?? {}
    for (const tp of m.team_member_positions) rec[tp.position_id] = tp.proficiency
    eligibility.set(m.person_id, rec)
    sex.set(m.person_id, m.people.sex)
  }

  const prefs = new Map((data.prefs ?? []).map((p) => [p.person_id, p]))

  const blockouts = new Map<string, { start: string; end: string }[]>()
  for (const b of data.blockouts ?? []) {
    const arr = blockouts.get(b.person_id) ?? []
    arr.push({ start: b.start_date, end: b.end_date })
    blockouts.set(b.person_id, arr)
  }

  const recurring = new Map<string, { weekOfMonth: number | null; weekday: number }[]>()
  for (const r of data.recurring ?? []) {
    const arr = recurring.get(r.person_id) ?? []
    arr.push({ weekOfMonth: r.week_of_month, weekday: r.weekday })
    recurring.set(r.person_id, arr)
  }

  // History excludes this plan (the consumer re-adds it as "this service").
  const history = new Map<string, { date: string; serviceTypeId: string }[]>()
  for (const row of data.history ?? []) {
    if (row.plan_id === excludePlanId || !row.plans) continue
    const arr = history.get(row.person_id) ?? []
    arr.push({ date: row.plans.date, serviceTypeId: row.plans.service_type_id })
    history.set(row.person_id, arr)
  }

  return { eligibility, prefs, blockouts, recurring, history, sex }
}

/** Assemble one person's full rule context from the maps. */
export function makeValidationPerson(
  maps: PersonContextMaps,
  id: string,
  name: string,
): ValidationPerson {
  const prefs = maps.prefs.get(id)
  return {
    id,
    name,
    sex: maps.sex.get(id) ?? null,
    status: prefs?.status ?? 'active',
    minGapDays: prefs?.min_gap_days ?? 0,
    maxPerMonth: prefs?.max_per_month ?? null,
    targetPerMonth: prefs?.target_per_month ?? null,
    maxConsecutive: prefs?.max_consecutive ?? null,
    eligibility: maps.eligibility.get(id) ?? {},
    blockouts: maps.blockouts.get(id) ?? [],
    recurringUnavailability: maps.recurring.get(id) ?? [],
    history: maps.history.get(id) ?? [],
  }
}

/**
 * Build a {@link ServiceState} for one plan from its assignments + the shared
 * data, and run the validator. Pure given its inputs — usable in a loop (matrix)
 * without breaking the rules of hooks.
 */
export function buildPlanValidation(
  plan: PlanWithType,
  planAssignments: AssignmentWithPerson[],
  data: SchedulingRulesData['data'],
): PlanValidation {
  const state = buildServiceState(plan, planAssignments, data)
  const { errors, warnings } = validateService(state)
  return { errors, warnings, all: [...errors, ...warnings], isPending: false }
}

/** The full validator input for one plan — shared by validation and the
 * effective-requirements resolver (issue #113 chips/steppers). */
export function buildServiceState(
  plan: PlanWithType,
  planAssignments: AssignmentWithPerson[],
  data: SchedulingRulesData['data'],
): ServiceState {
  const teams = data.teams ?? []
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))
  const servingTeamIds = new Set(
    teams.filter((t) => teamServesType(t, plan.service_type_id)).map((t) => t.id),
  )

  // Positions carry the base team default; the per-plan overrides (issue #110)
  // and conditional rules (issue #113) layer on via the resolver inside the
  // validator, which keeps the provenance ("who set this minimum") intact.
  const minOverrides = planMinCountMap(plan.id, data.minCounts)
  const positions: ValidationPosition[] = (data.positions ?? [])
    .filter((p) => servingTeamIds.has(p.team_id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.team_id,
      teamName: teamNameById.get(p.team_id) ?? '',
      minCount: p.min_count,
      maxCount: p.max_count,
      requiresLevel: p.requires_level as ValidationProficiency | null,
    }))

  const assignments = planAssignments.map((a) => ({
    personId: a.person_id,
    positionId: a.position_id,
    teamId: a.team_id,
    status: a.status,
  }))

  const maps = buildPersonContextMaps(data, plan.id)
  const nameById = new Map(planAssignments.map((a) => [a.person_id, fullName(a.people)]))
  // An assignee may not (any longer) be a team member — their sex still comes
  // along on the assignment's people embed.
  for (const a of planAssignments) {
    if (!maps.sex.has(a.person_id)) maps.sex.set(a.person_id, a.people.sex)
  }

  const assignedIds = [...new Set(assignments.map((a) => a.personId))]
  const people: ValidationPerson[] = assignedIds.map((id) =>
    makeValidationPerson(maps, id, nameById.get(id) ?? 'Someone'),
  )

  const { rules, mutedRuleIds } = planRuleContext(plan.id, data)
  const state: ServiceState = {
    service: { id: plan.id, date: plan.date, serviceTypeId: plan.service_type_id },
    positions,
    assignments,
    people,
    pairings: (data.pairings ?? []).map((p) => ({
      personA: p.person_a,
      personB: p.person_b,
      kind: p.kind,
      strength: p.strength,
    })),
    rules,
    planMinOverrides: minOverrides,
    mutedRuleIds,
  }

  return state
}

/**
 * The effective per-position minimums + rule statuses for one plan — powers
 * the plan page's rule chips and the min-stepper provenance (issue #113).
 * null while the underlying queries load.
 */
export function usePlanRequirements(
  plan: PlanWithType | undefined,
): ResolvedRequirements | null {
  const { isPending, data } = useSchedulingRulesData()
  const assignmentsQuery = usePlanAssignments(plan?.id)
  const planAssignments = assignmentsQuery.data

  return useMemo(() => {
    if (!plan || isPending || assignmentsQuery.isPending || !planAssignments) return null
    return resolveStateRequirements(buildServiceState(plan, planAssignments, data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, assignmentsQuery.isPending, planAssignments, data, plan?.id, plan?.date, plan?.service_type_id])
}

/**
 * Live validation for a single plan (plan page). Recomputes whenever an
 * assignment or rule changes, so badges update without waiting for publish.
 */
export function usePlanValidation(plan: PlanWithType | undefined): PlanValidation {
  const { isPending, data } = useSchedulingRulesData()
  const assignmentsQuery = usePlanAssignments(plan?.id)
  const planAssignments = assignmentsQuery.data

  return useMemo(() => {
    if (!plan || isPending || assignmentsQuery.isPending || !planAssignments) return EMPTY
    return buildPlanValidation(plan, planAssignments, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, assignmentsQuery.isPending, planAssignments, data, plan?.id, plan?.date, plan?.service_type_id])
}

/**
 * Coverage codes belong on the position header; everything else with people
 * belongs on the person rows. Keeps `NO_REQUIRED_LEVEL` (which names both a
 * position and the people in it) from showing twice.
 */
const POSITION_LEVEL_CODES = new Set([
  'MANDATORY_UNFILLED',
  'CONDITIONAL_MIN_UNFILLED',
  'NO_REQUIRED_LEVEL',
])

/** Coverage results for a position (slot header badges). */
export function resultsByPosition(results: RuleResult[]): Map<string, RuleResult[]> {
  const map = new Map<string, RuleResult[]>()
  for (const r of results) {
    if (!r.positionId || !POSITION_LEVEL_CODES.has(r.code)) continue
    const arr = map.get(r.positionId) ?? []
    arr.push(r)
    map.set(r.positionId, arr)
  }
  return map
}

/** Per-person results, excluding the coverage codes shown on the position. */
export function resultsByPerson(results: RuleResult[]): Map<string, RuleResult[]> {
  const map = new Map<string, RuleResult[]>()
  for (const r of results) {
    if (POSITION_LEVEL_CODES.has(r.code)) continue
    for (const id of r.personIds ?? []) {
      const arr = map.get(id) ?? []
      arr.push(r)
      map.set(id, arr)
    }
  }
  return map
}
