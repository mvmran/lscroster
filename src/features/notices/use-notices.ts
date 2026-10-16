import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

/**
 * A notice, ready to open: a PDF's signed link (null if signing failed) or a
 * link notice's web address (0055) — `kind` says which.
 */
export type Notice = Tables<'notices'> & { kind: 'pdf' | 'link'; url: string | null }

const BUCKET = 'notices'
export const NOTICE_MAX_MB = 20
export const NOTICE_MESSAGE_MAX = 200
const SIGNED_URL_TTL_SECONDS = 60 * 60
export const NOTICE_LINK_MAX = 2000
const noticesKey = ['notices'] as const

const messageSchema = z
  .string()
  .trim()
  .min(1, { error: 'Add a short description' })
  .max(NOTICE_MESSAGE_MAX, { error: `Keep it under ${NOTICE_MESSAGE_MAX} characters` })

/** The upload form's input; the bucket enforces the same type and size limits. */
export const newNoticeSchema = z.object({
  message: messageSchema,
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

/** A link notice's input; `notices.link_url` checks the same rule. */
export const newLinkNoticeSchema = z.object({
  message: messageSchema,
  url: z
    .string()
    .trim()
    .min(1, { error: 'Paste the web address' })
    .max(NOTICE_LINK_MAX, { error: 'That address is too long' })
    .regex(/^https?:\/\/\S+$/i, { error: 'Enter a full address starting with http:// or https://' }),
})
export type NewLinkNotice = z.infer<typeof newLinkNoticeSchema>

/** Only an http(s) address is ever handed to an href. */
const safeLink = (url: string | null) => (url && /^https?:\/\/\S+$/i.test(url) ? url : null)

/**
 * Every notice, newest first — each PDF with a signed link made up front, each
 * link notice with its own address. Real links
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

      // Only PDFs need signing; a link notice opens its own address.
      const paths = data.flatMap((n) => (n.storage_path ? [n.storage_path] : []))
      const urlByPath = new Map<string, string>()
      if (paths.length > 0) {
        const { data: signed, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
        if (signError) throw new Error(signError.message)
        for (const s of signed) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
      }
      return data.map((n) =>
        n.storage_path
          ? { ...n, kind: 'pdf' as const, url: urlByPath.get(n.storage_path) ?? null }
          : { ...n, kind: 'link' as const, url: safeLink(n.link_url) },
      )
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

export function useAddLinkNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      notice,
      createdBy,
    }: {
      notice: NewLinkNotice
      createdBy: string | null
    }) => {
      const { error } = await supabase.from('notices').insert({
        message: notice.message,
        link_url: notice.url,
        created_by: createdBy,
      })
      if (error) throw new Error(error.message)
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
      // A link notice has no file.
      if (notice.storage_path) await supabase.storage.from(BUCKET).remove([notice.storage_path])
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noticesKey }),
  })
}
