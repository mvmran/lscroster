import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

export const invitationKeys = {
  person: (personId: string) => ['invitations', personId] as const,
}

/** Pending invitation for a person. Admin-only (RLS); gate with `enabled`. */
export function usePersonInvitation(personId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: invitationKeys.person(personId ?? ''),
    enabled: enabled && !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('person_id', personId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface InviteResponse {
  ok: boolean
  emailSent?: boolean
  /** Returned when email isn't configured so the admin can share it manually. */
  inviteUrl?: string
}

export function useSendInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (personId: string) =>
      invokeFunction<InviteResponse>('invite', { personId, action: 'send' }),
    onSuccess: (_data, personId) =>
      queryClient.invalidateQueries({
        queryKey: invitationKeys.person(personId),
      }),
  })
}

export function useRevokeInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (personId: string) =>
      invokeFunction<{ ok: boolean }>('invite', { personId, action: 'revoke' }),
    onSuccess: (_data, personId) =>
      queryClient.invalidateQueries({
        queryKey: invitationKeys.person(personId),
      }),
  })
}
