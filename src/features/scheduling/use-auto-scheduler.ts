import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fullName } from '@/features/people/person-utils'
import { supabase } from '@/lib/supabase'
import { assignmentKeys, usePlanAssignments } from '@/features/scheduling/use-assignments'
import {
  buildPersonContextMaps,
  makeValidationPerson,
  useSchedulingRulesData,
} from '@/features/scheduling/use-service-state'
import { teamServesType } from '@/features/scheduling/use-teams'
import {
  autoSchedule,
  rankCandidates,
  type EngineCandidate,
  type EnginePosition,
  type EngineResult,
  type EngineState,
  type RankedCandidate,
  type Suggestion,
} from '@/features/scheduling/auto-scheduler'
import type { SchedulingRulesData } from '@/features/scheduling/use-service-state'
import type { ValidationProficiency } from '@/features/scheduling/validate-service'
import type { AssignmentWithPerson } from '@/features/scheduling/use-assignments'
import type { PlanWithType } from '@/features/services/use-plans'

const EMPTY_RESULT: EngineResult = { suggestions: [], unfilled: [] }

function buildEngineState(
  plan: PlanWithType,
  planAssignments: AssignmentWithPerson[],
  data: SchedulingRulesData['data'],
): EngineState {
  const teams = data.teams ?? []
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))
  const servingTeamIds = new Set(
    teams.filter((t) => teamServesType(t, plan.service_type_id)).map((t) => t.id),
  )

  const positions: EnginePosition[] = (data.positions ?? [])
    .filter((p) => servingTeamIds.has(p.team_id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.team_id,
      teamName: teamNameById.get(p.team_id) ?? '',
      minCount: p.min_count,
      maxCount: p.max_count,
      requiresLevel: p.requires_level as ValidationProficiency | null,
      fillPriority: p.fill_priority,
    }))

  const maps = buildPersonContextMaps(data, plan.id)
  const nameById = new Map<string, string>()
  for (const m of data.members ?? []) nameById.set(m.person_id, fullName(m.people))
  const candidateIds = [...new Set((data.members ?? []).map((m) => m.person_id))]
  const candidates: EngineCandidate[] = candidateIds.map((id) =>
    makeValidationPerson(maps, id, nameById.get(id) ?? 'Someone'),
  )

  const existingAssignments = planAssignments
    .filter((a) => a.status !== 'declined')
    .map((a) => ({ personId: a.person_id, positionId: a.position_id, teamId: a.team_id }))

  return {
    service: { id: plan.id, date: plan.date, serviceTypeId: plan.service_type_id },
    positions,
    candidates,
    existingAssignments,
    pairings: (data.pairings ?? []).map((p) => ({
      personA: p.person_a,
      personB: p.person_b,
      kind: p.kind,
      strength: p.strength,
    })),
  }
}

/** Insert accepted suggestions as `pending` assignments (the editable draft). */
function useApplySuggestions(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (suggestions: Suggestion[]) => {
      if (suggestions.length === 0) return
      const { error } = await supabase.from('plan_assignments').insert(
        suggestions.map((s) => ({
          plan_id: planId,
          person_id: s.personId,
          team_id: s.teamId,
          position_id: s.positionId,
        })),
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.plan(planId) })
      queryClient.invalidateQueries({ queryKey: assignmentKeys.mine })
      queryClient.invalidateQueries({ queryKey: ['assignments-on-date'] })
      queryClient.invalidateQueries({ queryKey: ['assignments-matrix'] })
      queryClient.invalidateQueries({ queryKey: ['rostered-dates'] })
    },
  })
}

/**
 * Auto-scheduler for a plan (issue #35). Builds the engine state from the shared
 * scheduling data + every eligible team member as a candidate, and exposes a
 * `suggest()` that runs the deterministic engine on demand, plus an `apply`
 * mutation that writes accepted suggestions as a draft.
 */
export function useAutoScheduler(plan: PlanWithType | undefined) {
  const { isPending, data } = useSchedulingRulesData()
  const assignmentsQuery = usePlanAssignments(plan?.id)
  const apply = useApplySuggestions(plan?.id ?? '')

  const state = useMemo<EngineState | null>(() => {
    if (!plan || isPending || assignmentsQuery.isPending || !assignmentsQuery.data) return null
    return buildEngineState(plan, assignmentsQuery.data, data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, plan?.date, plan?.service_type_id, isPending, assignmentsQuery.isPending, assignmentsQuery.data, data])

  return {
    isPending: isPending || assignmentsQuery.isPending,
    ready: !!state,
    /** Any serving position has a mandatory minimum — auto-fill has work to do. */
    hasMandatory: !!state && state.positions.some((p) => p.minCount >= 1),
    suggest: (): EngineResult => (state ? autoSchedule(state) : EMPTY_RESULT),
    /** Ranked substitutes for a position (replace / re-suggest), P4/P5. */
    rank: (positionId: string, exclude?: string[]): RankedCandidate[] =>
      state ? rankCandidates(state, positionId, { exclude }) : [],
    apply,
  }
}
