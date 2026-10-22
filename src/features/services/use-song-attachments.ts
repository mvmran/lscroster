import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startDownload } from '@/lib/download'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type SongAttachment = Tables<'song_attachments'>

const BUCKET = 'song-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Attachments hang off an arrangement since #130 (per-arrangement charts). */
export const songAttachmentsKey = (arrangementId: string) =>
  ['song-attachments', arrangementId] as const

export function useSongAttachments(arrangementId: string | undefined) {
  return useQuery({
    queryKey: songAttachmentsKey(arrangementId ?? ''),
    enabled: !!arrangementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_attachments')
        .select('*')
        .eq('arrangement_id', arrangementId!)
        .order('label')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useUploadSongAttachment(arrangementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${arrangementId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)

      const { data, error } = await supabase
        .from('song_attachments')
        .insert({ arrangement_id: arrangementId, storage_path: path, label: file.name })
        .select()
        .single()
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(error.message)
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: songAttachmentsKey(arrangementId) })
    },
  })
}

/**
 * Delete files from the song-attachments bucket once the song or arrangement
 * they belonged to has gone (the rows cascade; storage doesn't). Returns how
 * many couldn't be removed — storage refuses quietly, by removing fewer.
 */
export async function removeSongFiles(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths)
  return error ? paths.length : paths.length - data.length
}

export function useDeleteSongAttachment(arrangementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attachment: SongAttachment) => {
      const { error } = await supabase
        .from('song_attachments')
        .delete()
        .eq('id', attachment.id)
      if (error) throw new Error(error.message)
      // Best-effort: the DB row is the source of truth.
      await supabase.storage.from(BUCKET).remove([attachment.storage_path])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: songAttachmentsKey(arrangementId) })
    },
  })
}

/** Open/download an attachment via a short-lived signed URL. */
export function useOpenSongAttachment() {
  return useMutation({
    mutationFn: async (attachment: SongAttachment) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS, {
          download: attachment.label,
        })
      if (error) throw new Error(error.message)
      startDownload(data.signedUrl)
    },
  })
}
