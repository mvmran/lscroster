import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

/** A notice plus a signed link to its PDF (null if signing failed). */
export type Notice = Tables<'notices'> & { url: string | null }

const BUCKET = 'notices'
export const NOTICE_MAX_MB = 20
export const NOTICE_MESSAGE_MAX = 200
const SIGNED_URL_TTL_SECONDS = 60 * 60
const noticesKey = ['notices'] as const

/** The upload form's input; the bucket enforces the same type and size limits. */
export const newNoticeSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, { error: 'Add a short description' })
    .max(NOTICE_MESSAGE_MAX, { error: `Keep it under ${NOTICE_MESSAGE_MAX} characters` }),
  file: z
    .instanceof(File, { error: 'Choose a PDF to upload' })
    .refine((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name), {
      error: 'Only PDF files can go on the notice board',
    })
    .refine((f) => f.size <= NOTICE_MAX_MB * 1024 * 1024, {
      error: `PDFs must be under ${NOTICE_MAX_MB} MB`,
    }),
})
export type NewNotice = z.infer<typeof newNoticeSchema>

/**
 * Every notice, newest first, each with a signed link made up front. Real links
 * rather than a sign-on-click: a phone browser blocks a tab opened after an
 * await, so tapping a notice must be an ordinary <a>. Links last an hour and the
 * list refreshes well inside that.
 */
export function useNotices() {
  return useQuery({
    queryKey: noticesKey,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    queryFn: async (): Promise<Notice[]> => {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      if (data.length === 0) return []

      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          data.map((n) => n.storage_path),
          SIGNED_URL_TTL_SECONDS,
        )
      if (signError) throw new Error(signError.message)
      const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]))
      return data.map((n) => ({ ...n, url: urlByPath.get(n.storage_path) ?? null }))
    },
  })
}

export function useAddNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      notice,
      createdBy,
    }: {
      notice: NewNotice
      createdBy: string | null
    }) => {
      const path = `${crypto.randomUUID()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, notice.file, { contentType: 'application/pdf' })
      if (uploadError) throw new Error(uploadError.message)

      const { error } = await supabase.from('notices').insert({
        message: notice.message,
        storage_path: path,
        file_name: notice.file.name,
        created_by: createdBy,
      })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(error.message)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noticesKey }),
  })
}

export function useDeleteNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notice: Notice) => {
      // RLS turns a refused delete into "0 rows", not an error — check for one.
      const { data, error } = await supabase
        .from('notices')
        .delete()
        .eq('id', notice.id)
        .select('id')
      if (error) throw new Error(error.message)
      if (data.length === 0) throw new Error('That notice could not be removed.')
      // Best-effort: the row is the source of truth, and a stray file is unseen.
      await supabase.storage.from(BUCKET).remove([notice.storage_path])
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noticesKey }),
  })
}
