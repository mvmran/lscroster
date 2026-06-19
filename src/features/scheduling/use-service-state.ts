import { useMemo } from 'react'
import { fullName } from '@/features/people/person-utils'
import { usePlanAssignments, type AssignmentWithPerson } from '@/features/scheduling/use-assignments'
import { useBlockouts } from '@/features/scheduling/use-blockouts'
import {
  useAllPairings,
  useAllPersonPrefs,
  useAllRecurringUnavailability,
  useRosteredDates,
} from '@/features/scheduling/use-scheduling-rules'
import {
  teamServesType,
  useAllPositions,
  useAllTeamMembers,
  useTeams,
} from '@/features/scheduling/use-teams'
import {
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

  const isPending =
    teams.isPending ||
    positions.isPending ||
    members.isPending ||
    blockouts.isPending ||
    prefs.isPending ||
    recurring.isPending ||
    pairings.isPending ||
    history.isPending

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
    },
  }
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
}

export function buildPersonContextMaps(
  data: SchedulingRulesData['data'],
  excludePlanId: string,
): PersonContextMaps {
  const eligibility = new Map<string, Record<string, ValidationProficiency>>()
  for (const m of data.members ?? []) {
    const rec = eligibility.get(m.person_id) ?? {}
    for (const tp of m.team_member_positions) rec[tp.position_id] = tp.proficiency
    eligibility.set(m.person_id, rec)
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

  return { eligibility, prefs, blockouts, recurring, history }
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
  const teams = data.teams ?? []
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))
  const servingTeamIds = new Set(
    teams.filter((t) => teamServesType(t, plan.service_type_id)).map((t) => t.id),
  )

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

  const assignedIds = [...new Set(assignments.map((a) => a.personId))]
  const people: ValidationPerson[] = assignedIds.map((id) =>
    makeValidationPerson(maps, id, nameById.get(id) ?? 'Someone'),
  )

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
  }

  const { errors, warnings } = validateService(state)
  return { errors, warnings, all: [...errors, ...warnings], isPending: false }
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
const POSITION_LEVEL_CODES = new Set(['MANDATORY_UNFILLED', 'NO_REQUIRED_LEVEL'])

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
