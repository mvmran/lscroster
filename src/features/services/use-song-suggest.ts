/**
 * The optional AI "suggest the next song" helper (`suggest-song`).
 *
 * Optional per instance exactly like the lyrics helpers: a church that hasn't
 * set GEMINI_API_KEY gets `configured: false` from the probe and the Suggest
 * button never appears. Unlike those, this one reads the plan, the library and
 * the usage history server-side and returns a single song for the picker to add
 * through the ordinary (RLS-gated) path — nothing here writes to the database.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'

export interface SongSuggestion {
  songId: string
  title: string
  reason: string
  keyNote: string
}

interface SuggestResponse {
  songId?: string
  title?: string
  reason?: string
  keyNote?: string
  /** No candidate songs are left to suggest for this plan. */
  exhausted?: boolean
}

/** Whether the AI song-suggest feature is switched on for this instance. */
export function useSongSuggestAvailable(enabled = true) {
  return useQuery({
    queryKey: ['ai-function-available', 'suggest-song'],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const data = await invokeFunction<{ configured: boolean }>('suggest-song', {
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
 * Ask for one song to add next. `rejectedSongIds` are the ones the scheduler
 * has already turned down for this plan, so the model never offers them again.
 * Returns `{ exhausted: true }` when nothing suitable is left.
 */
export function useSuggestSong() {
  return useMutation({
    mutationFn: ({
      planId,
      rejectedSongIds,
    }: {
      planId: string
      rejectedSongIds: string[]
    }) =>
      invokeFunction<SuggestResponse>('suggest-song', { planId, rejectedSongIds }),
  })
}

// Rejected suggestions are remembered per plan, per device, in localStorage —
// so they survive closing and reopening the dialog (and a reload) but reset the
// moment the scheduler opens a different plan. No server state, no schema.
const rejectKey = (planId: string) => `lscroster:song-suggest-rejects:${planId}`

export function loadRejectedSongs(planId: string): string[] {
  try {
    const raw = localStorage.getItem(rejectKey(planId))
    const value = raw ? JSON.parse(raw) : []
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveRejectedSongs(planId: string, ids: string[]): void {
  try {
    localStorage.setItem(rejectKey(planId), JSON.stringify(ids))
  } catch {
    // Private windows and blocked storage: the reject list just won't persist.
  }
}
