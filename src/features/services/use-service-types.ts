import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database'

export const serviceTypesKey = ['service-types'] as const

export function useServiceTypes() {
  return useQuery({
    queryKey: serviceTypesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('sort_order')
        .order('name')
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidateServiceTypes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: serviceTypesKey })
}

export function useCreateServiceType() {
  const invalidate = useInvalidateServiceTypes()
  return useMutation({
    mutationFn: async (values: TablesInsert<'service_types'>) => {
      const { data, error } = await supabase
        .from('service_types')
        .insert(values)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateServiceType() {
  const invalidate = useInvalidateServiceTypes()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'service_types'>
    }) => {
      const { data, error } = await supabase
        .from('service_types')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: invalidate,
  })
}

/** Swap sort_order with the neighbour above/below. */
export function useReorderServiceType() {
  const invalidate = useInvalidateServiceTypes()
  return useMutation({
    mutationFn: async ({
      a,
      b,
    }: {
      a: { id: string; sort_order: number }
      b: { id: string; sort_order: number }
    }) => {
      const results = await Promise.all([
        supabase.from('service_types').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('service_types').update({ sort_order: a.sort_order }).eq('id', b.id),
      ])
      for (const { error } of results) {
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: invalidate,
  })
}

export function useDeleteServiceType() {
  const invalidate = useInvalidateServiceTypes()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_types').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

const serviceTypeTeamsKey = (serviceTypeId: string) =>
  ['service-type-teams', serviceTypeId] as const

/** Team ids required by a service type (for the edit dialog). */
export function useServiceTypeTeamIds(serviceTypeId: string | undefined) {
  return useQuery({
    queryKey: serviceTypeTeamsKey(serviceTypeId ?? ''),
    enabled: !!serviceTypeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_type_teams')
        .select('team_id')
        .eq('service_type_id', serviceTypeId!)
      if (error) throw new Error(error.message)
      return data.map((r) => r.team_id)
    },
  })
}

/** Replace the set of teams required by a service type. */
export function useSetServiceTypeTeams() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      serviceTypeId,
      teamIds,
    }: {
      serviceTypeId: string
      teamIds: string[]
    }) => {
      const { error: deleteError } = await supabase
        .from('service_type_teams')
        .delete()
        .eq('service_type_id', serviceTypeId)
      if (deleteError) throw new Error(deleteError.message)
      if (teamIds.length > 0) {
        const { error: insertError } = await supabase
          .from('service_type_teams')
          .insert(
            teamIds.map((team_id) => ({ service_type_id: serviceTypeId, team_id })),
          )
        if (insertError) throw new Error(insertError.message)
      }
      return serviceTypeId
    },
    onSuccess: (serviceTypeId) =>
      queryClient.invalidateQueries({ queryKey: serviceTypeTeamsKey(serviceTypeId) }),
  })
}
