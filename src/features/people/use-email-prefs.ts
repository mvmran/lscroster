import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

// Per-person email preferences (issue #87). A missing row means every flag is
// on (the Edge Functions default the same way), so people opt into all email.

export type PersonEmailPrefs = Tables<'person_email_prefs'>

export type EmailPrefKey =
  | 'roster_emails'
  | 'nudge_emails'
  | 'reminder_emails'
  | 'publish_emails'
  | 'roster_status_emails'

export const EMAIL_PREF_DEFAULTS: Record<EmailPrefKey, boolean> = {
  roster_emails: true,
  nudge_emails: true,
  reminder_emails: true,
  publish_emails: true,
  roster_status_emails: true,
}

export const emailPrefKeys = {
  detail: (personId: string) => ['email-prefs', personId] as const,
}

export function usePersonEmailPrefs(personId: string | undefined) {
  return useQuery({
    queryKey: emailPrefKeys.detail(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_email_prefs')
        .select('*')
        .eq('person_id', personId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as PersonEmailPrefs | null
    },
  })
}

export function useUpsertPersonEmailPrefs(personId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      values: Omit<TablesInsert<'person_email_prefs'>, 'person_id'>,
    ) => {
      const { data, error } = await supabase
        .from('person_email_prefs')
        .upsert({ ...values, person_id: personId }, { onConflict: 'person_id' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as PersonEmailPrefs
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: emailPrefKeys.detail(personId) }),
  })
}
