import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PAD, parsePadSettings, type PadSettings } from '@/lib/pad-settings'

// The signed-in person's pad sound (0054). No row — or a row this app can't
// read — means the default, Dark Warm. RLS shows a person only their own row.

const padSettingsKey = (personId: string) => ['pad-settings', personId] as const

/** The pad settings to play with: the person's saved choice, else the default. */
export function usePadSettings() {
  const { data: person } = useCurrentPerson()
  const query = useQuery({
    queryKey: padSettingsKey(person?.id ?? ''),
    enabled: !!person?.id,
    // A sound choice changes only on the Pad sound page, which refreshes this.
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_sound_prefs')
        .select('pad')
        .eq('person_id', person!.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? parsePadSettings(data.pad) : DEFAULT_PAD
    },
  })
  return { ...query, settings: query.data ?? DEFAULT_PAD }
}

export function useSavePadSettings() {
  const { data: person } = useCurrentPerson()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pad: PadSettings) => {
      if (!person) throw new Error('Not signed in')
      const { error } = await supabase
        .from('person_sound_prefs')
        .upsert({ person_id: person.id, pad }, { onConflict: 'person_id' })
      if (error) throw new Error(error.message)
      return pad
    },
    onSuccess: (pad) => {
      if (person) queryClient.setQueryData(padSettingsKey(person.id), pad)
    },
  })
}
