import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesUpdate } from '@/types/database'
import { todayISODate } from '@/features/services/service-utils'

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

/** Items copied into a new plan, from either a template or another plan. */
type CopiedItem = {
  sort_order: number
  kind: Tables<'plan_items'>['kind']
  title: string
  song_id: string | null
  key_override: string | null
  length_seconds: number
  description: string | null
}

async function fetchSourceItems(
  source: NonNullable<CreatePlanInput['source']>,
): Promise<CopiedItem[]> {
  const query =
    source.kind === 'template'
      ? supabase
          .from('plan_template_items')
          .select('sort_order, kind, title, song_id, key_override, length_seconds, description')
          .eq('template_id', source.id)
      : supabase
          .from('plan_items')
          .select('sort_order, kind, title, song_id, key_override, length_seconds, description')
          .eq('plan_id', source.id)
  const { data, error } = await query.order('sort_order')
  if (error) throw new Error(error.message)
  return data
}

/** Times carried into a new plan from a template or another plan (issue #73). */
type CopiedTime = { label: string; start_time: string; sort_order: number }

async function fetchSourceTimes(
  source: NonNullable<CreatePlanInput['source']>,
): Promise<CopiedTime[]> {
  const query =
    source.kind === 'template'
      ? supabase
          .from('plan_template_times')
          .select('label, start_time, sort_order')
          .eq('template_id', source.id)
      : supabase
          .from('plan_times')
          .select('label, start_time, sort_order')
          .eq('plan_id', source.id)
  const { data, error } = await query.order('sort_order')
  if (error) throw new Error(error.message)
  return data
}

/** Per-position minimum overrides carried into a new plan (issue #110). */
type CopiedMinCount = { position_id: string; min_count: number }

async function fetchSourceMinCounts(
  source: NonNullable<CreatePlanInput['source']>,
): Promise<CopiedMinCount[]> {
  const query =
    source.kind === 'template'
      ? supabase
          .from('plan_template_position_min_counts')
          .select('position_id, min_count')
          .eq('template_id', source.id)
      : supabase
          .from('plan_position_min_counts')
          .select('position_id, min_count')
          .eq('plan_id', source.id)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

/** The start-time override carried from a source template or plan (issue: per-plan start). */
async function fetchSourceStart(
  source: NonNullable<CreatePlanInput['source']>,
): Promise<string | null> {
  const table = source.kind === 'template' ? 'plan_templates' : 'plans'
  const { data, error } = await supabase
    .from(table)
    .select('start_time')
    .eq('id', source.id)
    .single()
  if (error) throw new Error(error.message)
  return data.start_time
}

export function useCreatePlan() {
  const invalidate = useInvalidatePlans()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ source, start_time, ...values }: CreatePlanInput) => {
      const [items, times, minCounts, sourceStart] = source
        ? await Promise.all([
            fetchSourceItems(source),
            fetchSourceTimes(source),
            fetchSourceMinCounts(source),
            fetchSourceStart(source),
          ])
        : [[], [], [], null]
      // An explicit override wins; otherwise inherit the source's start.
      const startTime = start_time !== undefined ? start_time : sourceStart
      const { data: plan, error } = await supabase
        .from('plans')
        .insert({ ...values, start_time: startTime })
        .select()
        .single()
      if (error) throw new Error(error.message)
      try {
        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from('plan_items')
            .insert(items.map((item) => ({ ...item, plan_id: plan.id })))
          if (itemsError) throw new Error(itemsError.message)
        }
        if (times.length > 0) {
          const { error: timesError } = await supabase
            .from('plan_times')
            .insert(times.map((time) => ({ ...time, plan_id: plan.id })))
          if (timesError) throw new Error(timesError.message)
        }
        if (minCounts.length > 0) {
          const { error: minCountsError } = await supabase
            .from('plan_position_min_counts')
            .insert(minCounts.map((m) => ({ ...m, plan_id: plan.id })))
          if (minCountsError) throw new Error(minCountsError.message)
        }
      } catch (e) {
        await supabase.from('plans').delete().eq('id', plan.id)
        throw e
      }
      return plan
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

export function useDeletePlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id)
      if (error) throw new Error(error.message)
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
