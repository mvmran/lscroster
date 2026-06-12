import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type PlanAttachment = Tables<'plan_attachments'>

const BUCKET = 'plan-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

export const planAttachmentsKey = (planId: string) =>
  ['plan-attachments', planId] as const

export function usePlanAttachments(planId: string | undefined) {
  return useQuery({
    queryKey: planAttachmentsKey(planId ?? ''),
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_attachments')
        .select('*')
        .eq('plan_id', planId!)
        .order('label')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useUploadPlanAttachment(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${planId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)

      const { data, error } = await supabase
        .from('plan_attachments')
        .insert({ plan_id: planId, storage_path: path, label: file.name })
        .select()
        .single()
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(error.message)
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planAttachmentsKey(planId) })
    },
  })
}

export function useDeletePlanAttachment(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attachment: PlanAttachment) => {
      const { error } = await supabase
        .from('plan_attachments')
        .delete()
        .eq('id', attachment.id)
      if (error) throw new Error(error.message)
      // Best-effort: the DB row is the source of truth.
      await supabase.storage.from(BUCKET).remove([attachment.storage_path])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planAttachmentsKey(planId) })
    },
  })
}

export function useOpenPlanAttachment() {
  return useMutation({
    mutationFn: async (attachment: PlanAttachment) => {
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
