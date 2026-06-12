import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/types/database'

export const blockoutKeys = {
  all: ['blockouts'] as const,
  ofPerson: (personId: string) => ['blockouts', personId] as const,
}

/** All visible blockouts — leaders see everyone's (RLS), members their own. */
export function useBlockouts() {
  return useQuery({
    queryKey: blockoutKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blockout_dates')
        .select('*')
        .order('start_date')
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 60 * 1000,
  })
}

export function usePersonBlockouts(personId: string | undefined) {
  return useQuery({
    queryKey: blockoutKeys.ofPerson(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blockout_dates')
        .select('*')
        .eq('person_id', personId!)
        .order('start_date')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function useInvalidateBlockouts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: blockoutKeys.all })
}

export function useCreateBlockout() {
  const invalidate = useInvalidateBlockouts()
  return useMutation({
    mutationFn: async (values: TablesInsert<'blockout_dates'>) => {
      const { error } = await supabase.from('blockout_dates').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteBlockout() {
  const invalidate = useInvalidateBlockouts()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('blockout_dates')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}
