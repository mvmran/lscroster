import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Song, SongArrangement } from '@/features/services/service-utils'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type SongUsage = Tables<'song_usage'>

export const songKeys = {
  all: ['songs'] as const,
  detail: (id: string) => ['songs', id] as const,
  usage: ['song-usage'] as const,
  history: (id: string) => ['song-history', id] as const,
  arrangements: (songId: string) => ['song-arrangements', songId] as const,
}

const SONG_SELECT = '*, song_arrangements(song_key, bpm, meter, is_default)'

type SongWithArrangements = Tables<'songs'> & {
  song_arrangements: Pick<SongArrangement, 'song_key' | 'bpm' | 'meter' | 'is_default'>[]
}

/** Flatten the embedded Default arrangement's key/BPM/meter onto the song row (#24/#25). */
function flattenSong(row: SongWithArrangements): Song {
  const { song_arrangements, ...song } = row
  const def = song_arrangements.find((a) => a.is_default)
  return {
    ...song,
    default_key: def?.song_key ?? null,
    bpm: def?.bpm ?? null,
    meter: def?.meter ?? null,
  }
}

export function useSongs() {
  return useQuery({
    queryKey: songKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select(SONG_SELECT)
        .order('title')
        .limit(2000)
      if (error) throw new Error(error.message)
      return (data as unknown as SongWithArrangements[]).map(flattenSong)
    },
    staleTime: 60 * 1000,
  })
}

export function useSong(id: string | undefined) {
  return useQuery({
    queryKey: songKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select(SONG_SELECT)
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? flattenSong(data as unknown as SongWithArrangements) : null
    },
  })
}

/** Every arrangement for a song, Default first (issue #24). */
export function useArrangements(songId: string | undefined) {
  return useQuery({
    queryKey: songKeys.arrangements(songId ?? ''),
    enabled: !!songId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_arrangements')
        .select('*')
        .eq('song_id', songId!)
        .order('is_default', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as SongArrangement[]
    },
  })
}

/** Usage stats per song from the song_usage view, keyed by song id. */
export function useSongUsage() {
  return useQuery({
    queryKey: songKeys.usage,
    queryFn: async () => {
      const { data, error } = await supabase.from('song_usage').select('*')
      if (error) throw new Error(error.message)
      const byId: Record<string, SongUsage> = {}
      for (const row of data) {
        if (row.song_id) byId[row.song_id] = row
      }
      return byId
    },
    staleTime: 60 * 1000,
  })
}

/** Plans a song has appeared in, newest first (for the song page). */
export function useSongHistory(songId: string | undefined) {
  return useQuery({
    queryKey: songKeys.history(songId ?? ''),
    enabled: !!songId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_items')
        .select('id, key_override, plans!inner(id, date, title, status, service_types(name))')
        .eq('song_id', songId!)
        .order('date', { referencedTable: 'plans', ascending: false })
        .limit(25)
      if (error) throw new Error(error.message)
      return data
        .slice()
        .sort((a, b) => b.plans.date.localeCompare(a.plans.date))
    },
  })
}

function useInvalidateSongs() {
  const queryClient = useQueryClient()
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: songKeys.all })
    if (id) queryClient.invalidateQueries({ queryKey: songKeys.detail(id) })
  }
}

export function useCreateSong() {
  const invalidate = useInvalidateSongs()
  return useMutation({
    mutationFn: async (values: TablesInsert<'songs'>) => {
      const { data, error } = await supabase
        .from('songs')
        .insert(values)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateSong() {
  const invalidate = useInvalidateSongs()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'songs'>
    }) => {
      const { data, error } = await supabase
        .from('songs')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (song) => invalidate(song.id),
  })
}

export function useDeleteSong() {
  const invalidate = useInvalidateSongs()
  return useMutation({
    mutationFn: async (id: string) => {
      // Remove attachment files first — the row cascade won't touch storage.
      const { data: attachments } = await supabase
        .from('song_attachments')
        .select('storage_path')
        .eq('song_id', id)
      if (attachments && attachments.length > 0) {
        await supabase.storage
          .from('song-attachments')
          .remove(attachments.map((a) => a.storage_path))
      }
      const { error } = await supabase.from('songs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * Arrangement writes change a song's flattened default key/BPM, so they also
 * refresh the songs list and the song detail (issue #24).
 */
function useInvalidateArrangements() {
  const queryClient = useQueryClient()
  return (songId: string) => {
    queryClient.invalidateQueries({ queryKey: songKeys.arrangements(songId) })
    queryClient.invalidateQueries({ queryKey: songKeys.all })
    queryClient.invalidateQueries({ queryKey: songKeys.detail(songId) })
  }
}

export function useCreateArrangement(songId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async (
      values: Omit<TablesInsert<'song_arrangements'>, 'song_id'>,
    ) => {
      const { data, error } = await supabase
        .from('song_arrangements')
        .insert({ ...values, song_id: songId })
        .select()
        .single()
      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'An arrangement with that name already exists'
            : error.message,
        )
      }
      return data as SongArrangement
    },
    onSuccess: () => invalidate(songId),
  })
}

export function useUpdateArrangement(songId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'song_arrangements'>
    }) => {
      const { data, error } = await supabase
        .from('song_arrangements')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'An arrangement with that name already exists'
            : error.message,
        )
      }
      return data as SongArrangement
    },
    onSuccess: () => invalidate(songId),
  })
}

export function useDeleteArrangement(songId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('song_arrangements')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(songId),
  })
}
