import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

type ServiceTypeRow = Tables<'service_types'>

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

/**
 * Persist a drag-reorder of the whole list (issue #51). Writes each row's
 * sort_order to its new index and optimistically updates the cache so the list
 * doesn't snap back while the updates are in flight — mirrors useReorderPlanItems.
 */
export function useReorderServiceTypes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: ServiceTypeRow[]) => {
      const results = await Promise.all(
        ordered.map((st, index) =>
          supabase.from('service_types').update({ sort_order: index }).eq('id', st.id),
        ),
      )
      for (const { error } of results) {
        if (error) throw new Error(error.message)
      }
    },
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: serviceTypesKey })
      const previous = queryClient.getQueryData<ServiceTypeRow[]>(serviceTypesKey)
      queryClient.setQueryData<ServiceTypeRow[]>(
        serviceTypesKey,
        ordered.map((st, index) => ({ ...st, sort_order: index })),
      )
      return { previous }
    },
    onError: (_error, _ordered, context) => {
      if (context?.previous) {
        queryClient.setQueryData(serviceTypesKey, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: serviceTypesKey })
    },
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

/** Team ids required by a service type, in display order (for the edit dialog). */
export function useServiceTypeTeamIds(serviceTypeId: string | undefined) {
  return useQuery({
    queryKey: serviceTypeTeamsKey(serviceTypeId ?? ''),
    enabled: !!serviceTypeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_type_teams')
        .select('team_id, sort_order')
        .eq('service_type_id', serviceTypeId!)
        .order('sort_order')
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
            teamIds.map((team_id, sort_order) => ({
              service_type_id: serviceTypeId,
              team_id,
              sort_order,
            })),
          )
        if (insertError) throw new Error(insertError.message)
      }
      return serviceTypeId
    },
    onSuccess: (serviceTypeId) => {
      queryClient.invalidateQueries({ queryKey: serviceTypeTeamsKey(serviceTypeId) })
      // Team displays (Teams list, team page) read the same join table.
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}
