import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { supabase } from '@/lib/supabase'
import { DEFAULT_CLICK_LEVEL } from '@/lib/metronome'
import { DEFAULT_PAD, parsePadSettings, type PadSettings } from '@/lib/pad-settings'
import type { TablesInsert } from '@/types/database'

// The signed-in person's sounds: their pad (0054) and click volume (0056). No
// row — or a pad this app can't read — means the defaults: Dark Warm, and a
// click at 0.6. RLS shows a person only their own row.

interface SoundPrefs {
  pad: PadSettings
  clickLevel: number
}

const DEFAULTS: SoundPrefs = { pad: DEFAULT_PAD, clickLevel: DEFAULT_CLICK_LEVEL }

const soundPrefsKey = (personId: string) => ['sound-prefs', personId] as const

function useSoundPrefs() {
  const { data: person } = useCurrentPerson()
  return useQuery({
    queryKey: soundPrefsKey(person?.id ?? ''),
    enabled: !!person?.id,
    // These change only in Settings, which refreshes this.
    staleTime: Infinity,
    queryFn: async (): Promise<SoundPrefs> => {
      const { data, error } = await supabase
        .from('person_sound_prefs')
        .select('pad, click_level')
        .eq('person_id', person!.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
        ? { pad: parsePadSettings(data.pad), clickLevel: data.click_level }
        : DEFAULTS
    },
  })
}

/** The pad settings to play with: the person's saved choice, else the default. */
export function usePadSettings() {
  const query = useSoundPrefs()
  return { ...query, settings: query.data?.pad ?? DEFAULT_PAD }
}

/** How loud the person's click plays, 0–1. */
export function useClickLevel() {
  const query = useSoundPrefs()
  return { ...query, level: query.data?.clickLevel ?? DEFAULT_CLICK_LEVEL }
}

type SoundPrefsRow = Omit<TablesInsert<'person_sound_prefs'>, 'person_id'>

/** Save one of the sounds; an upsert writes only the columns it's given. */
function useSaveSoundPref<T>(
  toRow: (value: T) => SoundPrefsRow,
  apply: (prefs: SoundPrefs, value: T) => SoundPrefs,
) {
  const { data: person } = useCurrentPerson()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (value: T) => {
      if (!person) throw new Error('Not signed in')
      const { error } = await supabase
        .from('person_sound_prefs')
        .upsert({ person_id: person.id, ...toRow(value) }, { onConflict: 'person_id' })
      if (error) throw new Error(error.message)
      return value
    },
    onSuccess: (value) => {
      if (!person) return
      queryClient.setQueryData<SoundPrefs>(soundPrefsKey(person.id), (prefs) =>
        apply(prefs ?? DEFAULTS, value),
      )
    },
  })
}

export function useSavePadSettings() {
  return useSaveSoundPref<PadSettings>(
    (pad) => ({ pad }),
    (prefs, pad) => ({ ...prefs, pad }),
  )
}

export function useSaveClickLevel() {
  return useSaveSoundPref<number>(
    (clickLevel) => ({ click_level: clickLevel }),
    (prefs, clickLevel) => ({ ...prefs, clickLevel }),
  )
}
