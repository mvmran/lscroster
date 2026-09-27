import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  holdsAllPermissions,
  holdsPermission,
  seesAllPlans,
  sortPermissions,
  type Permission,
} from '@/features/auth/permissions'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import type { Tables } from '@/types/database'

export type PermissionTemplate = Tables<'permission_templates'>

const permissionKeys = {
  person: (personId: string) => ['person-permissions', personId] as const,
  templates: ['permission-templates'] as const,
}

async function fetchPersonPermissions(personId: string): Promise<Set<Permission>> {
  const { data, error } = await supabase
    .from('person_permissions')
    .select('permission')
    .eq('person_id', personId)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.permission))
}

/** The permissions granted to one person (their own row, or anyone's for coordinators). */
export function usePersonPermissions(personId: string | undefined) {
  return useQuery({
    queryKey: permissionKeys.person(personId ?? ''),
    enabled: !!personId,
    queryFn: () => fetchPersonPermissions(personId!),
    staleTime: 60 * 1000,
  })
}

export interface Permissions {
  isAdmin: boolean
  /** Admin or coordinator: governance, and every BAU permission implicitly. */
  canGovern: boolean
  /** Does the signed-in person hold this BAU permission? */
  can: (permission: Permission) => boolean
  /** Sees every plan, drafts included (any plan permission). */
  canSeeAllPlans: boolean
  /** Church-wide delete switches (Settings → Church). */
  songDeleteAllowed: boolean
  personDeleteAllowed: boolean
}

const NONE = new Set<Permission>()

/**
 * What the signed-in person may do. Mirrors `has_permission()` in RLS, which
 * is what actually enforces it — this only decides which controls to show.
 */
export function usePermissions(): Permissions {
  const { data: me } = useCurrentPerson()
  const { data: settings } = useChurchSettings()
  const all = holdsAllPermissions(me?.role)
  const { data: granted } = usePersonPermissions(me && !all ? me.id : undefined)
  const mine = granted ?? NONE

  const can = useCallback(
    (permission: Permission) => holdsPermission(me?.role, mine, permission),
    [me?.role, mine],
  )

  return useMemo(
    () => ({
      isAdmin: me?.role === 'admin',
      canGovern: all,
      can,
      canSeeAllPlans: seesAllPlans(me?.role, mine),
      songDeleteAllowed: settings?.allow_song_delete ?? true,
      personDeleteAllowed: settings?.allow_person_delete ?? true,
    }),
    [me?.role, all, can, mine, settings?.allow_song_delete, settings?.allow_person_delete],
  )
}

function useInvalidateAfterGrant() {
  const queryClient = useQueryClient()
  return (personId: string) => {
    queryClient.invalidateQueries({ queryKey: permissionKeys.person(personId) })
    // A grant can change which plans the holder sees.
    queryClient.invalidateQueries({ queryKey: ['plans'] })
    queryClient.invalidateQueries({ queryKey: ['audit-log'] })
  }
}

/** Grant or revoke one permission. */
export function useTogglePermission(personId: string) {
  const invalidate = useInvalidateAfterGrant()
  return useMutation({
    mutationFn: async ({ permission, granted }: { permission: Permission; granted: boolean }) => {
      const { error } = granted
        ? await supabase.from('person_permissions').insert({ person_id: personId, permission })
        : await supabase
            .from('person_permissions')
            .delete()
            .eq('person_id', personId)
            .eq('permission', permission)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => invalidate(personId),
  })
}

/**
 * Make a person's grants exactly `permissions` (applying a template). Only the
 * difference is written, so the audit log records what actually changed.
 */
export function useReplacePermissions(personId: string) {
  const invalidate = useInvalidateAfterGrant()
  return useMutation({
    mutationFn: async (permissions: Permission[]) => {
      const current = await fetchPersonPermissions(personId)
      const wanted = new Set(permissions)
      const toAdd = [...wanted].filter((p) => !current.has(p))
      const toRemove = [...current].filter((p) => !wanted.has(p))
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('person_permissions')
          .delete()
          .eq('person_id', personId)
          .in('permission', toRemove)
        if (error) throw new Error(error.message)
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('person_permissions')
          .insert(toAdd.map((permission) => ({ person_id: personId, permission })))
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => invalidate(personId),
  })
}

/** Permission templates, by name. Coordinators only (RLS). */
export function usePermissionTemplates(enabled = true) {
  return useQuery({
    queryKey: permissionKeys.templates,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_templates')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function templateError(message: string) {
  return message.includes('permission_templates_name_key')
    ? 'A template with that name already exists'
    : message
}

export function useSavePermissionTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      name,
      permissions,
    }: {
      id?: string
      name: string
      permissions: Permission[]
    }) => {
      const values = { name: name.trim(), permissions: sortPermissions(permissions) }
      const { error } = id
        ? await supabase.from('permission_templates').update(values).eq('id', id)
        : await supabase.from('permission_templates').insert(values)
      if (error) throw new Error(templateError(error.message))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: permissionKeys.templates }),
  })
}

export function useDeletePermissionTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('permission_templates').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: permissionKeys.templates }),
  })
}
