/**
 * Drafting the meaning layer from a song's native script (`generate-meaning`).
 *
 * Optional per instance: a church that hasn't set GEMINI_API_KEY gets
 * `configured: false` from the probe, and the editor simply never offers the
 * button. Nothing here is required for the lyrics editor to work.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'

/**
 * Whether this instance has meaning generation switched on.
 *
 * One cheap probe per session — the function answers it without calling the
 * model. `false` on any failure: a church without the feature should see the
 * editor it has always had, never an error about something it never enabled.
 */
export function useMeaningGenerationAvailable(enabled = true) {
  return useQuery({
    queryKey: ['meaning-generation-available'],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const data = await invokeFunction<{ configured: boolean }>(
          'generate-meaning',
          { probe: true },
        )
        return data.configured === true
      } catch {
        return false
      }
    },
  })
}

/** Draft an English meaning, line-parallel to the native text it came from. */
export function useGenerateMeaning() {
  return useMutation({
    mutationFn: async ({
      native,
      language,
    }: {
      native: string
      language: string | null
    }) => {
      const data = await invokeFunction<{ meaning: string }>('generate-meaning', {
        native,
        language,
      })
      return data.meaning
    },
  })
}
