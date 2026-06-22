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

/** People whose account this person manages (issue #91 card text). */
export function usePeopleManagedBy(personId: string | undefined) {
  return useQuery({
    queryKey: ['people-managed-by', personId ?? ''],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, managed_accepted_at')
        .eq('managed_by_person_id', personId!)
        .order('first_name')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/**
 * Archive, reactivate, or clear the email of an account via the account-access
 * Edge Function (issues #91/#92): it makes the change AND emails the person
 * about the resulting sign-in change, which the browser can't do.
 */
export function useAccountAccess() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      personId: string
      action: 'archive' | 'reactivate' | 'clear-email'
    }) =>
      invokeFunction<{ ok: boolean }>('account-access', {
        personId: vars.personId,
        action: vars.action,
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.all })
      queryClient.invalidateQueries({ queryKey: peopleKeys.detail(vars.personId) })
    },
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
