import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// The worship set-list distribution list (issue #133): admin-curated people
// and/or teams the set-list email (with its PDF attachment) goes to. Kept
// deliberately small — each recipient is an individual Resend call because
// the Batch API can't carry attachments.

export interface SetlistRecipient {
  id: string
  person_id: string | null
  team_id: string | null
  people: { first_name: string; last_name: string } | null
  teams: { name: string } | null
}

export const setlistRecipientsKey = ['setlist-recipients'] as const

export function useSetlistRecipients() {
  return useQuery({
    queryKey: setlistRecipientsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setlist_recipients')
        .select('id, person_id, team_id, people(first_name, last_name), teams(name)')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data as unknown as SetlistRecipient[]
    },
    staleTime: 60 * 1000,
  })
}

export function useAddSetlistRecipient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (target: { personId: string } | { teamId: string }) => {
      const { error } = await supabase.from('setlist_recipients').insert(
        'personId' in target
          ? { person_id: target.personId }
          : { team_id: target.teamId },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: setlistRecipientsKey }),
  })
}

export function useRemoveSetlistRecipient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('setlist_recipients')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: setlistRecipientsKey }),
  })
}
