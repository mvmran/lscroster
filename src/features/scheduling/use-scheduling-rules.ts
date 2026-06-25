import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizePair } from '@/features/scheduling/scheduling-utils'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Data layer for scheduling rules (issue #32, phase 1). One-off unavailability
// stays in `blockout_dates` (see use-blockouts); everything else is here.

export type PersonSchedulingPrefs = Tables<'person_scheduling_prefs'>
export type RecurringUnavailability = Tables<'person_recurring_unavailability'>
export type PersonPairing = Tables<'person_pairings'>

export const schedulingRuleKeys = {
  prefs: (personId: string) => ['scheduling-prefs', personId] as const,
  recurring: (personId: string) => ['recurring-unavailability', personId] as const,
  pairings: (personId: string) => ['person-pairings', personId] as const,
  allPrefs: ['scheduling-prefs-all'] as const,
  allRecurring: ['recurring-unavailability-all'] as const,
  allPairings: ['person-pairings-all'] as const,
  rosteredDates: ['rostered-dates'] as const,
  allPlanMinCounts: ['plan-min-counts-all'] as const,
}

export type PlanPositionMinCount = Tables<'plan_position_min_counts'>

// --- per-plan minimum-required overrides (issue #110) ------------------------
// The "Min required" steppers store an override here per (plan, position); the
// validator/engine fall back to `positions.min_count` when no row exists. One
// small whole-table read powers validation for every plan in the matrix.

export function useAllPlanMinCounts() {
  return useQuery({
    queryKey: schedulingRuleKeys.allPlanMinCounts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_position_min_counts')
        .select('plan_id, position_id, min_count')
      if (error) throw new Error(error.message)
      return data as Pick<PlanPositionMinCount, 'plan_id' | 'position_id' | 'min_count'>[]
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Set (or clear) a per-plan minimum for one position. Upserts on
 * (plan_id, position_id); optimistically patches the shared all-overrides cache
 * so the stepper value and the understaffed badge update instantly.
 */
export function useSetPlanMinCount() {
  const queryClient = useQueryClient()
  type Vars = { planId: string; positionId: string; minCount: number }
  return useMutation({
    mutationFn: async ({ planId, positionId, minCount }: Vars) => {
      const { error } = await supabase
        .from('plan_position_min_counts')
        .upsert(
          { plan_id: planId, position_id: positionId, min_count: minCount },
          { onConflict: 'plan_id,position_id' },
        )
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ planId, positionId, minCount }: Vars) => {
      await queryClient.cancelQueries({ queryKey: schedulingRuleKeys.allPlanMinCounts })
      const previous = queryClient.getQueryData<
        Pick<PlanPositionMinCount, 'plan_id' | 'position_id' | 'min_count'>[]
      >(schedulingRuleKeys.allPlanMinCounts)
      queryClient.setQueryData<
        Pick<PlanPositionMinCount, 'plan_id' | 'position_id' | 'min_count'>[]
      >(schedulingRuleKeys.allPlanMinCounts, (rows) => {
        const next = (rows ?? []).filter(
          (r) => !(r.plan_id === planId && r.position_id === positionId),
        )
        next.push({ plan_id: planId, position_id: positionId, min_count: minCount })
        return next
      })
      return { previous }
    },
    onError: (_e, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(schedulingRuleKeys.allPlanMinCounts, context.previous)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: schedulingRuleKeys.allPlanMinCounts }),
  })
}

/** A person's non-declined assignment date for workload/cadence checks. */
export interface RosteredDate {
  person_id: string
  plan_id: string
  plans: { date: string; service_type_id: string } | null
}

// --- per-person preferences --------------------------------------------------

export function usePersonPrefs(personId: string | undefined) {
  return useQuery({
    queryKey: schedulingRuleKeys.prefs(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_scheduling_prefs')
        .select('*')
        .eq('person_id', personId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as PersonSchedulingPrefs | null
    },
  })
}

export function useUpsertPersonPrefs(personId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      values: Omit<TablesInsert<'person_scheduling_prefs'>, 'person_id'>,
    ) => {
      const { data, error } = await supabase
        .from('person_scheduling_prefs')
        .upsert({ ...values, person_id: personId }, { onConflict: 'person_id' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as PersonSchedulingPrefs
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: schedulingRuleKeys.prefs(personId) }),
  })
}

// --- recurring unavailability ------------------------------------------------

export function useRecurringUnavailability(personId: string | undefined) {
  return useQuery({
    queryKey: schedulingRuleKeys.recurring(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_recurring_unavailability')
        .select('*')
        .eq('person_id', personId!)
        .order('weekday')
      if (error) throw new Error(error.message)
      return data as RecurringUnavailability[]
    },
  })
}

export function useRecurringUnavailabilityMutations(personId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: schedulingRuleKeys.recurring(personId) })
  const add = useMutation({
    mutationFn: async (
      values: Omit<TablesInsert<'person_recurring_unavailability'>, 'person_id'>,
    ) => {
      const { error } = await supabase
        .from('person_recurring_unavailability')
        .insert({ ...values, person_id: personId })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('person_recurring_unavailability')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
  return { add, remove }
}

// --- prefer / avoid / together pairings --------------------------------------

export function usePersonPairings(personId: string | undefined) {
  return useQuery({
    queryKey: schedulingRuleKeys.pairings(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_pairings')
        .select('*')
        .or(`person_a.eq.${personId},person_b.eq.${personId}`)
      if (error) throw new Error(error.message)
      return data as PersonPairing[]
    },
  })
}

export function usePairingMutations(personId: string) {
  const queryClient = useQueryClient()
  // A pairing touches two people; refresh both their views.
  const invalidate = (otherId: string) => {
    queryClient.invalidateQueries({ queryKey: schedulingRuleKeys.pairings(personId) })
    queryClient.invalidateQueries({ queryKey: schedulingRuleKeys.pairings(otherId) })
  }
  const add = useMutation({
    mutationFn: async ({
      otherId,
      kind,
      strength,
    }: {
      otherId: string
      kind: PersonPairing['kind']
      strength: PersonPairing['strength']
    }) => {
      const [person_a, person_b] = normalizePair(personId, otherId)
      const { error } = await supabase
        .from('person_pairings')
        .insert({ person_a, person_b, kind, strength })
      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'That pairing already exists'
            : error.message,
        )
      }
      return otherId
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (pairing: PersonPairing) => {
      const { error } = await supabase
        .from('person_pairings')
        .delete()
        .eq('id', pairing.id)
      if (error) throw new Error(error.message)
      return pairing.person_a === personId ? pairing.person_b : pairing.person_a
    },
    onSuccess: invalidate,
  })
  return { add, remove }
}

// Position requirements (min/max/requires_level/fill_priority) are plain
// `positions` columns — edit them through the existing usePositionMutations
// `update` mutation, which already accepts a TablesUpdate<'positions'>.
export type PositionRequirements = Pick<
  TablesUpdate<'positions'>,
  'min_count' | 'max_count' | 'requires_level' | 'fill_priority'
>

// --- whole-table reads for the validator (issue #34, P2) ---------------------
// These power validateService, which needs rules for *everyone* on a plan.
// Small tables (one-ish row per person), cached together; far simpler than
// re-fetching per assigned person as a roster is edited.

export function useAllPersonPrefs() {
  return useQuery({
    queryKey: schedulingRuleKeys.allPrefs,
    queryFn: async () => {
      const { data, error } = await supabase.from('person_scheduling_prefs').select('*')
      if (error) throw new Error(error.message)
      return data as PersonSchedulingPrefs[]
    },
    staleTime: 60 * 1000,
  })
}

export function useAllRecurringUnavailability() {
  return useQuery({
    queryKey: schedulingRuleKeys.allRecurring,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_recurring_unavailability')
        .select('*')
      if (error) throw new Error(error.message)
      return data as RecurringUnavailability[]
    },
    staleTime: 60 * 1000,
  })
}

export function useAllPairings() {
  return useQuery({
    queryKey: schedulingRuleKeys.allPairings,
    queryFn: async () => {
      const { data, error } = await supabase.from('person_pairings').select('*')
      if (error) throw new Error(error.message)
      return data as PersonPairing[]
    },
    staleTime: 60 * 1000,
  })
}

/** One audit row for a rule violation a leader chose to publish past (#34). */
export interface PublishOverrideInput {
  rule_code: string
  severity: 'error' | 'warning'
  message: string
  reason: string | null
}

/**
 * Record the rule violations a leader overrode when publishing a plan. Each
 * becomes a `publish_overrides` row (`overridden_by` defaults to the current
 * person in the DB). The publish gate calls this before flipping the status.
 */
export function useRecordPublishOverrides(planId: string) {
  return useMutation({
    mutationFn: async (rows: PublishOverrideInput[]) => {
      if (rows.length === 0) return
      const { error } = await supabase
        .from('publish_overrides')
        .insert(rows.map((r) => ({ ...r, plan_id: planId })))
      if (error) throw new Error(error.message)
    },
  })
}

/**
 * Every non-declined assignment with its plan's date + service type — the
 * history the validator reads for cadence / per-month / consecutive checks.
 * Invalidated alongside the per-plan assignment lists (see use-assignments).
 */
export function useRosteredDates() {
  return useQuery({
    queryKey: schedulingRuleKeys.rosteredDates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select('person_id, plan_id, plans!inner(date, service_type_id)')
        .neq('status', 'declined')
      if (error) throw new Error(error.message)
      return data as unknown as RosteredDate[]
    },
    staleTime: 60 * 1000,
  })
}
