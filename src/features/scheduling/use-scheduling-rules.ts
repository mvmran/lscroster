import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizePair } from '@/features/scheduling/scheduling-utils'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Data layer for scheduling rules (issue #32, phase 1). One-off unavailability
// stays in `blockout_dates` (see use-blockouts); everything else is here.

export type PersonSchedulingPrefs = Tables<'person_scheduling_prefs'>
export type RecurringUnavailability = Tables<'person_recurring_unavailability'>
export type PersonPairing = Tables<'person_pairings'>
export type TeamExclusion = Tables<'team_exclusions'>

export const schedulingRuleKeys = {
  prefs: (personId: string) => ['scheduling-prefs', personId] as const,
  recurring: (personId: string) => ['recurring-unavailability', personId] as const,
  pairings: (personId: string) => ['person-pairings', personId] as const,
  teamExclusions: ['team-exclusions'] as const,
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

// --- team exclusions ---------------------------------------------------------

export function useTeamExclusions() {
  return useQuery({
    queryKey: schedulingRuleKeys.teamExclusions,
    queryFn: async () => {
      const { data, error } = await supabase.from('team_exclusions').select('*')
      if (error) throw new Error(error.message)
      return data as TeamExclusion[]
    },
    staleTime: 60 * 1000,
  })
}

export function useTeamExclusionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: schedulingRuleKeys.teamExclusions })
  const add = useMutation({
    mutationFn: async ({ teamA, teamB }: { teamA: string; teamB: string }) => {
      const [team_a, team_b] = normalizePair(teamA, teamB)
      const { error } = await supabase
        .from('team_exclusions')
        .insert({ team_a, team_b })
      if (error) {
        throw new Error(
          error.code === '23505' ? 'Those teams are already excluded' : error.message,
        )
      }
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (exclusion: TeamExclusion) => {
      const { error } = await supabase
        .from('team_exclusions')
        .delete()
        .eq('team_a', exclusion.team_a)
        .eq('team_b', exclusion.team_b)
      if (error) throw new Error(error.message)
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
