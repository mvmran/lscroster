import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Projection API keys (issue #135): per-device credentials for the Mac
// projection software. The raw key (lscp_ + 64 hex) is generated here in the
// admin's browser, shown once, and only its sha-256 hash is stored — so a
// leaked database backup can't reveal a usable key. Revoking sets revoked_at;
// the projection-api Edge Function refuses revoked keys immediately.

export interface ProjectionKey {
  id: string
  label: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export const projectionKeysKey = ['projection-api-keys'] as const

function randomKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `lscp_${hex}`
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useProjectionKeys() {
  return useQuery({
    queryKey: projectionKeysKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projection_api_keys')
        .select('id, label, key_prefix, created_at, last_used_at, revoked_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as ProjectionKey[]
    },
    staleTime: 60 * 1000,
  })
}

/** Generates a key, stores its hash, and resolves with the raw key (shown once). */
export function useCreateProjectionKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      label,
      createdBy,
    }: {
      label: string
      createdBy: string | null
    }) => {
      const rawKey = randomKey()
      const { error } = await supabase.from('projection_api_keys').insert({
        label,
        key_prefix: rawKey.slice(0, 11), // "lscp_" + 6 hex chars
        key_hash: await sha256Hex(rawKey),
        created_by: createdBy,
      })
      if (error) throw new Error(error.message)
      return rawKey
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectionKeysKey }),
  })
}

export function useRevokeProjectionKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('projection_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectionKeysKey }),
  })
}
