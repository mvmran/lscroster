import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database'
import type { PlanItem } from '@/features/services/service-utils'

export const planItemsKey = (planId: string) => ['plan-items', planId] as const

export function usePlanItems(planId: string | undefined) {
  return useQuery({
    queryKey: planItemsKey(planId ?? ''),
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_items')
        .select('*')
        .eq('plan_id', planId!)
        .order('sort_order')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function useInvalidatePlanItems(planId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: planItemsKey(planId) })
}

export function useCreatePlanItem(planId: string) {
  const invalidate = useInvalidatePlanItems(planId)
  return useMutation({
    mutationFn: async (values: Omit<TablesInsert<'plan_items'>, 'plan_id'>) => {
      const { data, error } = await supabase
        .from('plan_items')
        .insert({ ...values, plan_id: planId })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdatePlanItem(planId: string) {
  const invalidate = useInvalidatePlanItems(planId)
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'plan_items'>
    }) => {
      const { data, error } = await supabase
        .from('plan_items')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeletePlanItem(planId: string) {
  const invalidate = useInvalidatePlanItems(planId)
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_items').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

/**
 * Persist a drag-reorder. Optimistically writes the new order to the cache so
 * the list doesn't snap back while the upsert is in flight.
 */
export function useReorderPlanItems(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: PlanItem[]) => {
      const rows = ordered.map((item, index) => ({
        id: item.id,
        plan_id: item.plan_id,
        kind: item.kind,
        title: item.title,
        song_id: item.song_id,
        key_override: item.key_override,
        length_seconds: item.length_seconds,
        description: item.description,
        sort_order: index,
      }))
      const { error } = await supabase.from('plan_items').upsert(rows)
      if (error) throw new Error(error.message)
    },
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: planItemsKey(planId) })
      const previous = queryClient.getQueryData<PlanItem[]>(planItemsKey(planId))
      queryClient.setQueryData<PlanItem[]>(
        planItemsKey(planId),
        ordered.map((item, index) => ({ ...item, sort_order: index })),
      )
      return { previous }
    },
    onError: (_error, _ordered, context) => {
      if (context?.previous) {
        queryClient.setQueryData(planItemsKey(planId), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: planItemsKey(planId) })
    },
  })
}
