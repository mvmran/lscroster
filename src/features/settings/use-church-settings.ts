import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
