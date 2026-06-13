import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesUpdate } from '@/types/database'

export const churchSettingsQueryKey = ['church-settings'] as const

/**
 * The single church_settings row, or `null` when the instance has not been
 * set up yet (drives the first-run setup wizard redirect).
 */
export function useChurchSettings() {
  return useQuery({
    queryKey: churchSettingsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('church_settings')
        .select('*')
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Admin edits to the single church_settings row (name, address). */
export function useUpdateChurchSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'church_settings'>
    }) => {
      const { data, error } = await supabase
        .from('church_settings')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: churchSettingsQueryKey })
    },
  })
}
