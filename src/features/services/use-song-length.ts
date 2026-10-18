import { useMutation, useQuery } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'

/** What the `estimate-song-length` function answers. */
export interface SongLengthEstimate {
  /** The song itself, start to finish — worked out from `bars`. */
  songSeconds: number
  /** The bars the model counted, all sections together. */
  bars: number
  /** The changeover added for moving to the next song. */
  changeSeconds: number
  /** What goes in the plan's Length box: the two, rounded up to 15 s. */
  totalSeconds: number
  /** One sentence on how the model counted it. */
  reasoning: string
}

/**
 * Whether the AI song-length estimate is switched on for this instance — the
 * same GEMINI_API_KEY as the other AI helpers. Asked once a session; off (and
 * the button hidden) if the probe fails for any reason.
 */
export function useSongLengthAvailable(enabled = true) {
  return useQuery({
    queryKey: ['ai-function-available', 'estimate-song-length'],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const data = await invokeFunction<{ configured: boolean }>('estimate-song-length', {
          probe: true,
        })
        return data.configured === true
      } catch {
        return false
      }
    },
  })
}

/**
 * Estimate a song's length on a plan: its lyrics and chords (the version the
 * plan is pinned to, if any) at the plan's tempo, plus the changeover.
 */
export function useEstimateSongLength() {
  return useMutation({
    mutationFn: (input: {
      arrangementId: string
      lyricsId: string | null
      bpm: number | null
    }) => invokeFunction<SongLengthEstimate>('estimate-song-length', input),
  })
}
