import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Person = Tables<'people'>

export const peopleKeys = {
  all: ['people'] as const,
  detail: (id: string) => ['people', id] as const,
}

/**
 * Turn a Postgres error into a human message. A unique-violation (23505) on the
 * email index means another person already uses that address (issue #38) —
 * surface that instead of the raw `people_email_unique` constraint text.
 */
function personErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === '23505' && error.message.includes('people_email_unique')) {
    return 'A person with this email already exists.'
  }
  return error.message
}

export function usePeople() {
  return useQuery({
    queryKey: peopleKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .order('first_name')
        .order('last_name')
        .limit(2000)
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 60 * 1000,
  })
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: peopleKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function useInvalidatePeople() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: peopleKeys.all })
}

export function useCreatePerson() {
  const invalidate = useInvalidatePeople()
  return useMutation({
    mutationFn: async (values: TablesInsert<'people'>) => {
      const { data, error } = await supabase
        .from('people')
        .insert(values)
        .select()
        .single()
      if (error) throw new Error(personErrorMessage(error))
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdatePerson() {
  const invalidate = useInvalidatePeople()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'people'>
    }) => {
      const { data, error } = await supabase
        .from('people')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(personErrorMessage(error))
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeletePerson() {
  const invalidate = useInvalidatePeople()
  return useMutation({
    // Via Edge Function: also removes the linked auth account and photo,
    // which the client has no permission to do.
    mutationFn: (id: string) =>
      invokeFunction<{ ok: boolean }>('delete-person', { personId: id }),
    onSuccess: invalidate,
  })
}
