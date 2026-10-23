import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { COUNT_ONLY, countRows } from '@/lib/count-rows'
import type { Tables, TablesUpdate } from '@/types/database'
import { todayISODate } from '@/features/services/service-utils'
import { removePlanFiles } from '@/features/services/use-plan-attachments'

/** A plan row with its service type embedded (the lists always need the name). */
export type PlanWithType = Tables<'plans'> & {
  service_types: Tables<'service_types'>
}

export const planKeys = {
  all: ['plans'] as const,
  detail: (id: string) => ['plans', id] as const,
}

const PLAN_WITH_TYPE = '*, service_types(*)'

export function usePlans() {
  return useQuery({
    queryKey: planKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select(PLAN_WITH_TYPE)
        .order('date', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      return data as PlanWithType[]
    },
    staleTime: 60 * 1000,
  })
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: planKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select(PLAN_WITH_TYPE)
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as PlanWithType | null
    },
  })
}

function useInvalidatePlans() {
  const queryClient = useQueryClient()
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: planKeys.all })
    if (id) queryClient.invalidateQueries({ queryKey: planKeys.detail(id) })
  }
}

export interface CreatePlanInput {
  service_type_id: string
  date: string
  title: string | null
  /**
   * Per-plan start-time override ('HH:mm:ss'). When omitted (undefined), the
   * start is inherited from the source template/plan (if any), else left null
   * to inherit the service type's default. Pass null to force the default.
   */
  start_time?: string | null
  /** Copy the order of service from a template or an existing plan. */
  source?: { kind: 'template' | 'plan'; id: string }
}

/**
 * Create one plan per date — one, or a weekly run (#72) — each copied from the
 * source template or plan if given: its order of service, times and
 * per-position minimums. One transaction (`create_plans`, 0067): every plan
 * is made or none is, so a failure partway can't leave earlier weeks behind
 * for a retry to duplicate. lyrics_id is deliberately not copied — new plans
 * are drafts, and drafts follow the arrangement's latest lyrics (#130).
 * Returns the plans by date.
 */
export function useCreatePlans() {
  const invalidate = useInvalidatePlans()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      dates,
      source,
      start_time,
      ...values
    }: Omit<CreatePlanInput, 'date'> & { dates: string[] }) => {
      const { data, error } = await supabase.rpc('create_plans', {
        p_plan: { ...values, start_time: start_time ?? null },
        p_dates: dates,
        ...(source ? { p_source_kind: source.kind, p_source_id: source.id } : {}),
        // An explicit start (or null) wins; omitted inherits the source's.
        p_inherit_start: start_time === undefined,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      invalidate()
      // Copied per-plan minimum overrides (#110) land in the shared cache.
      queryClient.invalidateQueries({ queryKey: ['plan-min-counts-all'] })
    },
  })
}

export function useUpdatePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'plans'>
    }) => {
      const { data, error } = await supabase
        .from('plans')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (plan) => invalidate(plan.id),
  })
}

/**
 * Delete a plan, then its attachment files — the rows cascade, the files
 * don't (0058). `filesLeft` counts any storage wouldn't remove.
 */
export function useDeletePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (id: string) => {
      // Where its files are, before the rows that say so cascade away.
      const { data: files, error: filesError } = await supabase
        .from('plan_attachments')
        .select('storage_path')
        .eq('plan_id', id)
      if (filesError) throw new Error(filesError.message)
      const { data: gone, error } = await supabase
        .from('plans')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw new Error(error.message)
      // RLS refuses a delete by deleting nothing — and then the files must stay.
      if (gone.length === 0) throw new Error('You can’t delete this plan')
      return { filesLeft: await removePlanFiles(files.map((f) => f.storage_path)) }
    },
    onSuccess: () => invalidate(),
  })
}

export function splitUpcomingPast(plans: PlanWithType[]) {
  const today = todayISODate()
  const upcoming = plans.filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const past = plans.filter((p) => p.date < today)
  return { upcoming, past }
}

/**
 * What deleting a plan takes with it, for the warning before it goes: its
 * order of service, everyone scheduled on it and its attachments (all cascade).
 */
export function usePlanDeleteImpact(planId: string | null) {
  return useQuery({
    queryKey: ['delete-impact', 'plan', planId ?? ''],
    enabled: !!planId,
    staleTime: 0,
    queryFn: async () => {
      const id = planId!
      const [items, assignments, attachments] = await Promise.all([
        countRows(supabase.from('plan_items').select('id', COUNT_ONLY).eq('plan_id', id)),
        countRows(
          supabase.from('plan_assignments').select('id', COUNT_ONLY).eq('plan_id', id),
        ),
        countRows(
          supabase.from('plan_attachments').select('id', COUNT_ONLY).eq('plan_id', id),
        ),
      ])
      return { items, assignments, attachments }
    },
  })
}
