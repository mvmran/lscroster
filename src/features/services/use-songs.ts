import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LayeredLyrics } from '@/features/services/lyric-layers'
import type {
  ArrangementLyrics,
  Song,
  SongArrangement,
} from '@/features/services/service-utils'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type SongUsage = Tables<'song_usage'>
export type SongPlanUsage = Tables<'song_plan_usage'>

/** An arrangement with the songs it's linked to, in medley order (#130). */
export type ArrangementWithSongs = SongArrangement & {
  linked_songs: { id: string; title: string; sort_order: number }[]
}

export const songKeys = {
  all: ['songs'] as const,
  detail: (id: string) => ['songs', id] as const,
  usage: ['song-usage'] as const,
  history: (id: string) => ['song-history', id] as const,
  arrangements: (songId: string) => ['song-arrangements', songId] as const,
  lyrics: (arrangementId: string) => ['arrangement-lyrics', arrangementId] as const,
}

/**
 * Songs embed their junction rows + arrangements (#130) so the list, picker
 * and plan readers can flatten the Default's key/BPM/meter and know every
 * arrangement without extra round-trips.
 */
const SONG_SELECT =
  '*, song_arrangement_songs(arrangement_id, sort_order, song_arrangements(*))'

type SongRow = Tables<'songs'> & {
  song_arrangement_songs: {
    arrangement_id: string
    sort_order: number
    song_arrangements: SongArrangement | null
  }[]
}

/** Flatten the embedded arrangements onto the song row (#24/#130). */
function flattenSong(row: SongRow): Song {
  const { song_arrangement_songs, ...song } = row
  const arrangements = song_arrangement_songs
    .map((l) => l.song_arrangements)
    .filter((a): a is SongArrangement => !!a)
    .sort(
      (a, b) =>
        Number(b.is_default) - Number(a.is_default) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name),
    )
  const def = arrangements.find((a) => a.is_default)
  return {
    ...song,
    default_key: def?.song_key ?? null,
    bpm: def?.bpm ?? null,
    meter: def?.meter ?? null,
    default_arrangement_id: def?.id ?? null,
    arrangements,
    arrangement_links: song_arrangement_songs.map((l) => ({
      arrangement_id: l.arrangement_id,
      sort_order: l.sort_order,
    })),
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
      return (data as unknown as SongRow[]).map(flattenSong)
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
      return data ? flattenSong(data as unknown as SongRow) : null
    },
  })
}

/**
 * Every arrangement linked to a song, Default first, each carrying its full
 * linked-song list so medleys can show their partner songs (#130).
 */
export function useArrangements(songId: string | undefined) {
  return useQuery({
    queryKey: songKeys.arrangements(songId ?? ''),
    enabled: !!songId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_arrangement_songs')
        .select(
          'song_arrangements(*, song_arrangement_songs(sort_order, songs(id, title)))',
        )
        .eq('song_id', songId!)
      if (error) throw new Error(error.message)
      type Row = {
        song_arrangements:
          | (SongArrangement & {
              song_arrangement_songs: {
                sort_order: number
                songs: { id: string; title: string } | null
              }[]
            })
          | null
      }
      return (data as unknown as Row[])
        .map((r) => r.song_arrangements)
        .filter((a): a is NonNullable<Row['song_arrangements']> => !!a)
        .map(({ song_arrangement_songs, ...arrangement }) => ({
          ...arrangement,
          linked_songs: song_arrangement_songs
            .filter((l) => l.songs)
            .map((l) => ({ ...l.songs!, sort_order: l.sort_order }))
            .sort(
              (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
            ),
        }))
        .sort(
          (a, b) =>
            Number(b.is_default) - Number(a.is_default) ||
            a.sort_order - b.sort_order ||
            a.name.localeCompare(b.name),
        ) as ArrangementWithSongs[]
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

/**
 * Plans a song has appeared in, newest first (for the song page). Reads the
 * song_plan_usage view, so medley appearances count too (#130).
 */
export function useSongHistory(songId: string | undefined) {
  return useQuery({
    queryKey: songKeys.history(songId ?? ''),
    enabled: !!songId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_plan_usage')
        .select('*')
        .eq('song_id', songId!)
        .order('date', { ascending: false })
        .limit(25)
      if (error) throw new Error(error.message)
      return data as SongPlanUsage[]
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
      // Storage cleanup: only attachments of arrangements that would be
      // orphaned by this delete — a medley shared with another song survives,
      // and so must its files. The row cascade handles the DB side.
      const { data: links } = await supabase
        .from('song_arrangement_songs')
        .select('arrangement_id')
        .eq('song_id', id)
      const arrangementIds = (links ?? []).map((l) => l.arrangement_id)
      if (arrangementIds.length > 0) {
        const { data: otherLinks } = await supabase
          .from('song_arrangement_songs')
          .select('arrangement_id')
          .in('arrangement_id', arrangementIds)
          .neq('song_id', id)
        const shared = new Set((otherLinks ?? []).map((l) => l.arrangement_id))
        const exclusive = arrangementIds.filter((a) => !shared.has(a))
        if (exclusive.length > 0) {
          const { data: attachments } = await supabase
            .from('song_attachments')
            .select('storage_path')
            .in('arrangement_id', exclusive)
          if (attachments && attachments.length > 0) {
            await supabase.storage
              .from('song-attachments')
              .remove(attachments.map((a) => a.storage_path))
          }
        }
      }
      const { error } = await supabase.from('songs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(),
  })
}

/**
 * Arrangement writes change a song's flattened default key/BPM, and a medley
 * is visible from every linked song — so refresh all arrangement queries plus
 * the songs list/detail (issue #24/#130).
 */
function useInvalidateArrangements() {
  const queryClient = useQueryClient()
  return (songId: string) => {
    queryClient.invalidateQueries({ queryKey: ['song-arrangements'] })
    queryClient.invalidateQueries({ queryKey: songKeys.all })
    queryClient.invalidateQueries({ queryKey: songKeys.detail(songId) })
  }
}

export function useCreateArrangement(songId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async (values: TablesInsert<'song_arrangements'>) => {
      const { data, error } = await supabase
        .from('song_arrangements')
        .insert(values)
        .select()
        .single()
      if (error) throw new Error(error.message)
      const { error: linkError } = await supabase
        .from('song_arrangement_songs')
        .insert({ arrangement_id: data.id, song_id: songId, sort_order: 0 })
      if (linkError) {
        // Unlinked arrangements are invisible; best-effort cleanup.
        await supabase.from('song_arrangements').delete().eq('id', data.id)
        throw new Error(linkError.message)
      }
      // Seed the new arrangement's lyrics from the song's Default so the editor
      // isn't blank (#131) — all four layers copied verbatim, so the native,
      // meaning and chord lines stay parallel to the base text (#139).
      // Best-effort — an empty Default just leaves it blank.
      const seed = await fetchDefaultLyrics(songId)
      if (seed && seed.lyrics.trim()) {
        await supabase.from('song_arrangement_lyrics').insert({
          arrangement_id: data.id,
          lyrics: seed.lyrics,
          lyrics_native: seed.lyrics_native,
          lyrics_meaning: seed.lyrics_meaning,
          lyrics_chords: seed.lyrics_chords,
          native_language: seed.native_language,
        })
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
      if (error) throw new Error(error.message)
      return data as SongArrangement
    },
    onSuccess: () => invalidate(songId),
  })
}

export function useDeleteArrangement(songId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async (id: string) => {
      // Row cascade won't touch storage, so remove the files first.
      const { data: attachments } = await supabase
        .from('song_attachments')
        .select('storage_path')
        .eq('arrangement_id', id)
      if (attachments && attachments.length > 0) {
        await supabase.storage
          .from('song-attachments')
          .remove(attachments.map((a) => a.storage_path))
      }
      const { error } = await supabase
        .from('song_arrangements')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(songId),
  })
}

/**
 * Link another song into an arrangement, making it a medley — it then appears
 * under every linked song (#130).
 */
export function useLinkSongToArrangement(currentSongId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async ({
      arrangementId,
      songId,
      sortOrder,
    }: {
      arrangementId: string
      songId: string
      sortOrder: number
    }) => {
      const { error } = await supabase
        .from('song_arrangement_songs')
        .insert({ arrangement_id: arrangementId, song_id: songId, sort_order: sortOrder })
      if (error) {
        throw new Error(
          error.code === '23505' ? 'That song is already linked' : error.message,
        )
      }
    },
    onSuccess: () => invalidate(currentSongId),
  })
}

export function useUnlinkSongFromArrangement(currentSongId: string) {
  const invalidate = useInvalidateArrangements()
  return useMutation({
    mutationFn: async ({
      arrangementId,
      songId,
    }: {
      arrangementId: string
      songId: string
    }) => {
      const { error } = await supabase
        .from('song_arrangement_songs')
        .delete()
        .eq('arrangement_id', arrangementId)
        .eq('song_id', songId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(currentSongId),
  })
}

/** The latest lyrics version for an arrangement, or null when none (#130). */
export function useArrangementLyrics(arrangementId: string | undefined) {
  return useQuery({
    queryKey: songKeys.lyrics(arrangementId ?? ''),
    enabled: !!arrangementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_arrangement_lyrics')
        .select('*')
        .eq('arrangement_id', arrangementId!)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as ArrangementLyrics | null
    },
  })
}

/**
 * True when a lyrics version is pinned by any plan item — i.e. it appeared on
 * a published plan, so an edit must create a new version instead of rewriting
 * it (#130).
 */
export async function isLyricsVersionPinned(lyricsId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('plan_items')
    .select('id')
    .eq('lyrics_id', lyricsId)
    .limit(1)
  if (error) throw new Error(error.message)
  return data.length > 0
}

/**
 * Save an arrangement's lyrics: update the latest version in place, or insert
 * a new version when the latest is pinned by a published plan (the caller
 * decides after checking `isLyricsVersionPinned` and notifying the user).
 */
export function useSaveArrangementLyrics(arrangementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      layers,
      current,
      asNewVersion,
    }: {
      /** All four layers; they version together on the one row (#139). */
      layers: LayeredLyrics
      /** The latest version row the editor was seeded from, if any. */
      current: ArrangementLyrics | null
      asNewVersion: boolean
    }) => {
      const columns = {
        lyrics: layers.lyrics,
        lyrics_native: layers.native || null,
        lyrics_meaning: layers.meaning || null,
        lyrics_chords: layers.chords || null,
      }
      if (current && !asNewVersion) {
        const { data, error } = await supabase
          .from('song_arrangement_lyrics')
          .update(columns)
          .eq('id', current.id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        return data as ArrangementLyrics
      }
      // Version numbers are assigned by a DB trigger (max + 1).
      const { data, error } = await supabase
        .from('song_arrangement_lyrics')
        .insert({ arrangement_id: arrangementId, ...columns })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ArrangementLyrics
    },
    onSuccess: (data) => {
      // Seed the cache so the editor doesn't flash the previous version.
      queryClient.setQueryData(songKeys.lyrics(arrangementId), data)
      queryClient.invalidateQueries({ queryKey: songKeys.lyrics(arrangementId) })
      queryClient.invalidateQueries({ queryKey: ['plan-lyrics'] })
    },
  })
}

/** A song's Default arrangement via the junction (#130). */
export async function fetchDefaultArrangement(
  songId: string,
): Promise<SongArrangement | null> {
  const { data, error } = await supabase
    .from('song_arrangement_songs')
    .select('song_arrangements!inner(*)')
    .eq('song_id', songId)
  if (error) throw new Error(error.message)
  type Row = { song_arrangements: SongArrangement }
  return (
    (data as unknown as Row[])
      .map((r) => r.song_arrangements)
      .find((a) => a.is_default) ?? null
  )
}

/** What a new arrangement is seeded from: every layer of the Default's lyrics. */
export type DefaultLyricsSeed = Pick<
  ArrangementLyrics,
  'lyrics' | 'lyrics_native' | 'lyrics_meaning' | 'lyrics_chords' | 'native_language'
>

/**
 * The lyrics to seed a new arrangement or a newly linked medley song from:
 * the latest version of that song's Default arrangement (#130), carrying all
 * four layers (#139).
 */
export async function fetchDefaultLyrics(
  songId: string,
): Promise<DefaultLyricsSeed | null> {
  const def = await fetchDefaultArrangement(songId)
  if (!def) return null
  const { data, error } = await supabase
    .from('song_arrangement_lyrics')
    .select('lyrics, lyrics_native, lyrics_meaning, lyrics_chords, native_language')
    .eq('arrangement_id', def.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}
