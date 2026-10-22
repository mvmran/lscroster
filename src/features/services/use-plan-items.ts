import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database'
import type { ArrangementLyrics, PlanItem } from '@/features/services/service-utils'

export const planItemsKey = (planId: string) => ['plan-items', planId] as const

/**
 * Every lyrics version of the plan's arrangements, keyed by row id (#130).
 * Pinned versions (plan_items.lyrics_id on published plans) belong to those
 * same arrangements, so one query covers both pinned and latest resolution in
 * `buildLyricsSheet`.
 */
export function usePlanLyrics(
  planId: string | undefined,
  items: PlanItem[] | undefined,
) {
  const arrangementIds = [
    ...new Set(
      (items ?? [])
        .map((i) => i.arrangement_id)
        .filter((id): id is string => !!id),
    ),
  ].sort()
  return useQuery({
    queryKey: ['plan-lyrics', planId ?? '', arrangementIds.join(',')],
    enabled: !!planId,
    queryFn: async () => {
      if (arrangementIds.length === 0) return new Map<string, ArrangementLyrics>()
      const { data, error } = await supabase
        .from('song_arrangement_lyrics')
        .select('*')
        .in('arrangement_id', arrangementIds)
      if (error) throw new Error(error.message)
      return new Map((data as ArrangementLyrics[]).map((row) => [row.id, row]))
    },
  })
}

/**
 * The lyrics version a song box reads the song's sequence from: the item's
 * pinned version once the plan is published, else the arrangement's latest.
 * Null with no arrangement, or no lyrics.
 */
export function usePlanItemLyrics(arrangementId: string | null, lyricsId: string | null) {
  return useQuery({
    queryKey: ['plan-item-lyrics', arrangementId ?? '', lyricsId ?? ''],
    enabled: !!arrangementId,
    queryFn: async () => {
      const rows = supabase.from('song_arrangement_lyrics').select('*')
      const { data, error } = await (lyricsId
        ? rows.eq('id', lyricsId)
        : rows.eq('arrangement_id', arrangementId!).order('version', { ascending: false })
      )
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as ArrangementLyrics | null
    },
  })
}

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
 * Publishing locks each song item to its arrangement's latest lyrics version
 * (#130) so later edits create a new version instead of rewriting the plan.
 */
export function usePinPlanLyrics(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('pin_plan_lyrics', { p_plan_id: planId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planItemsKey(planId) })
      queryClient.invalidateQueries({ queryKey: ['plan-lyrics'] })
    },
  })
}

/** Unpublishing releases the pins — drafts follow the latest lyrics (#130). */
export function useClearPlanLyricsPins(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('plan_items')
        .update({ lyrics_id: null })
        .eq('plan_id', planId)
        .not('lyrics_id', 'is', null)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planItemsKey(planId) })
      queryClient.invalidateQueries({ queryKey: ['plan-lyrics'] })
    },
  })
}

/**
 * Persist a drag-reorder. Optimistically writes the new order to the cache so
 * the list doesn't snap back while the save is in flight. Only the order is
 * sent (`reorder_plan_items`, 0066): upserting the cached rows let a stale
 * screen re-insert deleted items and undo another editor's changes.
 */
export function useReorderPlanItems(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: PlanItem[]) => {
      const { error } = await supabase.rpc('reorder_plan_items', {
        p_plan_id: planId,
        p_item_ids: ordered.map((item) => item.id),
      })
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
