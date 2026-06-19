import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'
import type { AssignmentStatus } from '@/features/scheduling/scheduling-utils'

export type AssignmentWithPerson = Tables<'plan_assignments'> & {
  people: Tables<'people'>
}

export type MyAssignment = Tables<'plan_assignments'> & {
  plans: Tables<'plans'> & {
    service_types: Tables<'service_types'>
    plan_times: Tables<'plan_times'>[]
  }
  teams: Tables<'teams'>
  positions: Tables<'positions'>
}

/** Minimal shape for the same-day clash check (issue #14). */
export interface AssignmentOnDate {
  id: string
  person_id: string
  plan_id: string
  status: AssignmentStatus
  plans: {
    date: string
    start_time: string | null
    service_types: {
      default_start_time: string | null
      end_time: string | null
    } | null
  } | null
  teams: { name: string } | null
}

export const assignmentKeys = {
  plan: (planId: string) => ['assignments', planId] as const,
  mine: ['my-assignments'] as const,
  onDate: (date: string) => ['assignments-on-date', date] as const,
  personSchedule: (personId: string) => ['person-schedule', personId] as const,
}

/** One service a person is (was) scheduled onto, for the profile Schedules card. */
export interface PersonScheduleRow {
  id: string
  status: AssignmentStatus
  /** Set when the request email went out — null means "yet to be emailed". */
  notified_at: string | null
  /** Position + team drive the per-service position list (issue #56). */
  position_id: string
  team_id: string
  plans: {
    id: string
    date: string
    service_type_id: string
    service_types: { name: string } | null
  } | null
}

/**
 * A person's non-declined assignments with each plan's date — powers the
 * Schedules card on the person page (issue #52, extended in #56 with the
 * position/team/service-type a row is for). Keyed by personId (unlike the
 * constant `mine` key) so any profile can load its own list. RLS limits what a
 * viewer sees: admins/leaders see all, a member sees their own.
 */
export function usePersonSchedule(personId: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.personSchedule(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select(
          'id, status, notified_at, position_id, team_id, plans!inner(id, date, service_type_id, service_types(name))',
        )
        .eq('person_id', personId!)
        .neq('status', 'declined')
      if (error) throw new Error(error.message)
      return data as unknown as PersonScheduleRow[]
    },
  })
}

export interface RosterWorkloadRow {
  person_id: string
  plans: { date: string } | null
}

/**
 * Every non-declined assignment across the church in the trailing year — used to
 * rank one person's serving load against the team (the percentile in the #56
 * Activity summary). Gate with `enabled`: only admins/leaders can read others'
 * assignments under RLS, so for a member viewing their own profile this query is
 * skipped (the percentile is hidden rather than computed from just themselves).
 */
export function useRosterWorkload(enabled: boolean) {
  return useQuery({
    queryKey: ['roster-workload'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - 1)
      const { data, error } = await supabase
        .from('plan_assignments')
        .select('person_id, plans!inner(date)')
        .neq('status', 'declined')
        .gte('plans.date', cutoff.toISOString().slice(0, 10))
      if (error) throw new Error(error.message)
      return data as unknown as RosterWorkloadRow[]
    },
  })
}

export function usePlanAssignments(planId: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.plan(planId ?? ''),
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select('*, people(*)')
        .eq('plan_id', planId!)
      if (error) throw new Error(error.message)
      return data as AssignmentWithPerson[]
    },
  })
}

/**
 * Everyone scheduled anywhere on a given date — powers the double-booking
 * warning when scheduling. Carries each plan's service-type start/end time so
 * the warning can fire only when the services actually overlap (issue #14).
 */
export function useAssignmentsOnDate(date: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.onDate(date ?? ''),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select(
          'id, person_id, plan_id, status, plans!inner(date, start_time, service_types(default_start_time, end_time)), teams(name)',
        )
        .eq('plans.date', date!)
      if (error) throw new Error(error.message)
      return data as unknown as AssignmentOnDate[]
    },
  })
}

/** The signed-in person's assignments with full plan context (My Schedule). */
export function useMyAssignments(personId: string | undefined) {
  return useQuery({
    queryKey: assignmentKeys.mine,
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select('*, plans(*, service_types(*), plan_times(*)), teams(*), positions(*)')
        .eq('person_id', personId!)
      if (error) throw new Error(error.message)
      // plans should always be visible for own assignments (RLS grants it),
      // but never let a missing embed crash the page.
      return (data as MyAssignment[])
        .filter((a) => a.plans)
        .sort((a, b) => a.plans.date.localeCompare(b.plans.date))
    },
  })
}

function useInvalidateAssignments() {
  const queryClient = useQueryClient()
  return (planId?: string) => {
    if (planId) {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.plan(planId) })
    }
    queryClient.invalidateQueries({ queryKey: assignmentKeys.mine })
    queryClient.invalidateQueries({ queryKey: ['assignments-on-date'] })
    queryClient.invalidateQueries({ queryKey: ['assignments-matrix'] })
    // The validator's workload/cadence history (issue #34).
    queryClient.invalidateQueries({ queryKey: ['rostered-dates'] })
    // Profile Schedules card (issue #52) — refresh for every person.
    queryClient.invalidateQueries({ queryKey: ['person-schedule'] })
    // Team workload percentile in the Activity summary (issue #56).
    queryClient.invalidateQueries({ queryKey: ['roster-workload'] })
  }
}

export function useCreateAssignment(planId: string) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: async (
      values: Omit<TablesInsert<'plan_assignments'>, 'plan_id'>,
    ) => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .insert({ ...values, plan_id: planId })
        .select()
        .single()
      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'Already scheduled in this position'
            : error.message,
        )
      }
      return data
    },
    onSuccess: () => invalidate(planId),
  })
}

export function useDeleteAssignment(planId: string) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('plan_assignments')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(planId),
  })
}

/** Leader resets a declined slot to pending for a different person. */
export function useReplaceAssignment(planId: string) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: async ({
      oldAssignmentId,
      values,
    }: {
      oldAssignmentId: string
      values: Omit<TablesInsert<'plan_assignments'>, 'plan_id'>
    }) => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .insert({ ...values, plan_id: planId })
        .select()
        .single()
      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'Already scheduled in this position'
            : error.message,
        )
      }
      const { error: deleteError } = await supabase
        .from('plan_assignments')
        .delete()
        .eq('id', oldAssignmentId)
      if (deleteError) throw new Error(deleteError.message)
      return data
    },
    onSuccess: () => invalidate(planId),
  })
}

/** Member answers a request in-app (RLS + trigger scope this to own rows). */
export function useRespondInApp() {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string
      status: Exclude<AssignmentStatus, 'pending'>
      reason?: string
    }) => {
      const { error } = await supabase
        .from('plan_assignments')
        .update({
          status,
          responded_at: new Date().toISOString(),
          decline_reason: status === 'declined' ? (reason?.trim() || null) : null,
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(),
  })
}

export interface SendRequestsResult {
  ok: boolean
  sent: number
  skipped: { name: string; reason: string }[]
}

/** Email pending requests via the send-requests Edge Function. */
export function useSendRequests(planId: string) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: (assignmentIds?: string[]) =>
      invokeFunction<SendRequestsResult>('send-requests', {
        planId,
        ...(assignmentIds ? { assignmentIds } : {}),
      }),
    onSuccess: () => invalidate(planId),
  })
}

/**
 * Remove an assignment, emailing a cancellation notice when the person had
 * confirmed (issue #16). Routed through the cancel-assignment Edge Function so
 * the email goes out server-side; the delete happens there too.
 */
export function useCancelAssignment(planId: string) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: (assignmentId: string) =>
      invokeFunction<{ ok: boolean; notified: boolean }>('cancel-assignment', {
        assignmentId,
      }),
    onSuccess: () => invalidate(planId),
  })
}

export interface PlanNotificationResult {
  ok: boolean
  sent: number
  skipped: { name: string; reason: string }[]
}

/** Email the full plan summary to everyone scheduled on it (issue #17). */
export function useSendPlanNotification(planId: string) {
  return useMutation({
    mutationFn: () =>
      invokeFunction<PlanNotificationResult>('send-plan-notification', {
        planId,
      }),
  })
}
