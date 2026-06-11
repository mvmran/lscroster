import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type SongUsage = Tables<'song_usage'>

export const songKeys = {
  all: ['songs'] as const,
  detail: (id: string) => ['songs', id] as const,
  usage: ['song-usage'] as const,
  history: (id: string) => ['song-history', id] as const,
}

export function useSongs() {
  return useQuery({
    queryKey: songKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .order('title')
        .limit(2000)
      if (error) throw new Error(error.message)
      return data
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
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
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
