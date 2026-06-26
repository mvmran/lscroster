import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'
import { invitationKeys } from '@/features/people/use-invitations'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Person = Tables<'people'>

export const peopleKeys = {
  all: ['people'] as const,
  detail: (id: string) => ['people', id] as const,
}

/**
 * The columns of `people` every authenticated user may read. Migration 0027
 * (issue #119) locked email/phone/birthday away from the client roles, so
 * `select('*')` on the base table now fails — embeds and write-backs must list
 * these instead. Contact details are read through the masked `people_directory`
 * view (see usePeople/usePerson). `has_email` is the non-sensitive
 * "is this person emailable?" flag for the scheduling UI.
 */
export const PERSON_SAFE_COLUMNS =
  'id, first_name, last_name, role, status, photo_url, notes, ' +
  'auth_user_id, managed_by_person_id, managed_accepted_at, has_email, ' +
  'created_at, updated_at'

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
      // Read through the masked view (issue #119): contact details come back
      // only for people this viewer is allowed to see; everyone else's
      // email/phone/birthday are null.
      const { data, error } = await supabase
        .from('people_directory')
        .select('*')
        .order('first_name')
        .order('last_name')
        .limit(2000)
      if (error) throw new Error(error.message)
      return data as unknown as Person[]
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
        .from('people_directory')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as Person | null
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
      // Write to the base table, but read back only the non-sensitive columns —
      // the contact columns are no longer SELECT-able by the client (issue #119).
      const { data, error } = await supabase
        .from('people')
        .insert(values)
        .select(PERSON_SAFE_COLUMNS)
        .single()
      if (error) throw new Error(personErrorMessage(error))
      return data as unknown as Person
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
        .select(PERSON_SAFE_COLUMNS)
        .single()
      if (error) throw new Error(personErrorMessage(error))
      return data as unknown as Person
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
 * Archive, reactivate, clear the email of, or detach the managing member from an
 * account via the account-access Edge Function (issues #91/#92, #89 follow-up):
 * it makes the change AND emails the affected person (the account holder, or for
 * detach-manager the former manager), which the browser can't do. detach-manager
 * also clears any stale managed invitation so the record returns to a fresh
 * pending state.
 */
export function useAccountAccess() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      personId: string
      action: 'archive' | 'reactivate' | 'clear-email' | 'detach-manager'
    }) =>
      invokeFunction<{ ok: boolean }>('account-access', {
        personId: vars.personId,
        action: vars.action,
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.all })
      queryClient.invalidateQueries({ queryKey: peopleKeys.detail(vars.personId) })
      // The managed invitation was dropped server-side — refresh so the button
      // reads "Send invitation" again rather than "Resend".
      queryClient.invalidateQueries({
        queryKey: invitationKeys.person(vars.personId),
      })
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
