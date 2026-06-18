import { useMutation, useQueryClient } from '@tanstack/react-query'
import { churchSettingsQueryKey } from '@/features/settings/use-church-settings'
import { supabase } from '@/lib/supabase'
import type { TablesUpdate } from '@/types/database'

// Church logo (issue #58): a light/default logo (church_settings.logo_url) and
// a dark-theme variant (logo_dark_url), stored in the public `church-logo`
// bucket so they render on the pre-auth sign-in page without a signed URL.

const LOGO_BUCKET = 'church-logo'

export type LogoVariant = 'light' | 'dark'

/** A typed partial update setting one variant's column to a path (or null). */
function columnUpdate(
  variant: LogoVariant,
  value: string | null,
): TablesUpdate<'church_settings'> {
  return variant === 'light' ? { logo_url: value } : { logo_dark_url: value }
}

/** Public URL for a stored logo path (synchronous — no network call). */
export function logoPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

export function useUploadChurchLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      settingsId,
      variant,
      file,
      currentPath,
    }: {
      settingsId: string
      variant: LogoVariant
      file: File
      currentPath: string | null
    }) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `${variant}-${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)

      const { error: updateError } = await supabase
        .from('church_settings')
        .update(columnUpdate(variant, path))
        .eq('id', settingsId)
      if (updateError) {
        await supabase.storage.from(LOGO_BUCKET).remove([path])
        throw new Error(updateError.message)
      }

      if (currentPath) {
        await supabase.storage.from(LOGO_BUCKET).remove([currentPath])
      }
      return path
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: churchSettingsQueryKey }),
  })
}

export function useClearChurchLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      settingsId,
      variant,
      currentPath,
    }: {
      settingsId: string
      variant: LogoVariant
      currentPath: string | null
    }) => {
      const { error } = await supabase
        .from('church_settings')
        .update(columnUpdate(variant, null))
        .eq('id', settingsId)
      if (error) throw new Error(error.message)
      if (currentPath) {
        await supabase.storage.from(LOGO_BUCKET).remove([currentPath])
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: churchSettingsQueryKey }),
  })
}
