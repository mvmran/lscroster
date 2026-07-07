import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
      window.open(data.signedUrl, '_blank', 'noopener')
    },
  })
}
