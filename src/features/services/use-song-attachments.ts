import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type SongAttachment = Tables<'song_attachments'>

const BUCKET = 'song-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

export const songAttachmentsKey = (songId: string) =>
  ['song-attachments', songId] as const

export function useSongAttachments(songId: string | undefined) {
  return useQuery({
    queryKey: songAttachmentsKey(songId ?? ''),
    enabled: !!songId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_attachments')
        .select('*')
        .eq('song_id', songId!)
        .order('label')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useUploadSongAttachment(songId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${songId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)

      const { data, error } = await supabase
        .from('song_attachments')
        .insert({ song_id: songId, storage_path: path, label: file.name })
        .select()
        .single()
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(error.message)
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: songAttachmentsKey(songId) })
    },
  })
}

export function useDeleteSongAttachment(songId: string) {
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
      queryClient.invalidateQueries({ queryKey: songAttachmentsKey(songId) })
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
