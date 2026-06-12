import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

export type PlanTime = Tables<'plan_times'>

export const planTimesKey = (planId: string) => ['plan-times', planId] as const

export function usePlanTimes(planId: string | undefined) {
  return useQuery({
    queryKey: planTimesKey(planId ?? ''),
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_times')
        .select('*')
        .eq('plan_id', planId!)
        .order('start_time')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function usePlanTimeMutations(planId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: planTimesKey(planId) })

  const add = useMutation({
    mutationFn: async (values: Omit<TablesInsert<'plan_times'>, 'plan_id'>) => {
      const { error } = await supabase
        .from('plan_times')
        .insert({ ...values, plan_id: planId })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_times').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { add, remove }
}

/** "Rehearsal 8:30am · Service 10:00am" for summaries and emails. */
export function formatPlanTimes(
  times: Pick<PlanTime, 'label' | 'start_time'>[],
  formatTime: (time: string) => string | null,
): string | null {
  if (times.length === 0) return null
  return times
    .map((t) => `${t.label} ${formatTime(t.start_time) ?? ''}`.trim())
    .join(' · ')
}
