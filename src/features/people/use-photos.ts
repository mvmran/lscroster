import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { peopleKeys, type Person } from '@/features/people/use-people'
import { supabase } from '@/lib/supabase'

const PHOTOS_BUCKET = 'photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Signed URL for a single photo path (private bucket). */
export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['photo-url', path],
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL_SECONDS - 600) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(path!, SIGNED_URL_TTL_SECONDS)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
  })
}

/** Batch signed URLs for the directory list, keyed by storage path. */
export function usePhotoUrls(paths: string[]) {
  const sorted = [...paths].sort()
  return useQuery({
    queryKey: ['photo-urls', sorted],
    enabled: sorted.length > 0,
    staleTime: (SIGNED_URL_TTL_SECONDS - 600) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrls(sorted, SIGNED_URL_TTL_SECONDS)
      if (error) throw new Error(error.message)
      const byPath: Record<string, string> = {}
      for (const entry of data) {
        if (entry.path && entry.signedUrl) byPath[entry.path] = entry.signedUrl
      }
      return byPath
    },
  })
}

export function useUploadPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ person, file }: { person: Person; file: File }) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${person.id}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)

      const { error: updateError } = await supabase
        .from('people')
        .update({ photo_url: path })
        .eq('id', person.id)
      if (updateError) {
        await supabase.storage.from(PHOTOS_BUCKET).remove([path])
        throw new Error(updateError.message)
      }

      // Best-effort cleanup of the previous photo.
      if (person.photo_url) {
        await supabase.storage.from(PHOTOS_BUCKET).remove([person.photo_url])
      }
      return path
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.all })
      queryClient.invalidateQueries({ queryKey: ['photo-urls'] })
    },
  })
}

/**
 * Remove a person's photo (issue #121): clear photo_url so the avatar reverts
 * to initials, then best-effort delete the stored file.
 */
export function useRemovePhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ person }: { person: Person }) => {
      const { error } = await supabase
        .from('people')
        .update({ photo_url: null })
        .eq('id', person.id)
      if (error) throw new Error(error.message)
      if (person.photo_url) {
        await supabase.storage.from(PHOTOS_BUCKET).remove([person.photo_url])
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKeys.all })
      queryClient.invalidateQueries({ queryKey: ['photo-urls'] })
    },
  })
}
