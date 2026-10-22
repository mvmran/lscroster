import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayISODate } from '@/features/services/service-utils'
import { removePlanFiles } from '@/features/services/use-plan-attachments'
import { COUNT_ONLY, countRows } from '@/lib/count-rows'
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

/**
 * Delete a service type — every plan under it cascades — then those plans'
 * attachment files, which don't (0058). `filesLeft` counts any storage
 * wouldn't remove.
 */
export function useDeleteServiceType() {
  const invalidate = useInvalidateServiceTypes()
  return useMutation({
    mutationFn: async (id: string) => {
      // Where its plans' files are, before the rows that say so cascade away.
      const { data: files, error: filesError } = await supabase
        .from('plan_attachments')
        .select('storage_path, plans!inner(service_type_id)')
        .eq('plans.service_type_id', id)
      if (filesError) throw new Error(filesError.message)
      const { data: gone, error } = await supabase
        .from('service_types')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw new Error(error.message)
      // RLS refuses a delete by deleting nothing — and then the files must stay.
      if (gone.length === 0) throw new Error('You can’t delete this service type')
      return { filesLeft: await removePlanFiles(files.map((f) => f.storage_path)) }
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

/**
 * Replace the set of teams required by a service type, in display order. One
 * transaction (`replace_service_type_teams`, 0065), so a failure leaves the
 * list as it was.
 */
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
      const { error } = await supabase.rpc('replace_service_type_teams', {
        p_service_type_id: serviceTypeId,
        p_team_ids: teamIds,
      })
      if (error) throw new Error(error.message)
      return serviceTypeId
    },
    onSuccess: (serviceTypeId) => {
      queryClient.invalidateQueries({ queryKey: serviceTypeTeamsKey(serviceTypeId) })
      // Team displays (Teams list, team page) read the same join table.
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

/**
 * What deleting a service type takes with it: every plan under it — and with
 * each, everyone scheduled and its attachments — plus its templates.
 */
export function useServiceTypeDeleteImpact(serviceTypeId: string | null) {
  return useQuery({
    queryKey: ['delete-impact', 'service-type', serviceTypeId ?? ''],
    enabled: !!serviceTypeId,
    staleTime: 0,
    queryFn: async () => {
      const id = serviceTypeId!
      const [plans, upcoming, assignments, attachments, templates] = await Promise.all([
        countRows(
          supabase.from('plans').select('id', COUNT_ONLY).eq('service_type_id', id),
        ),
        countRows(
          supabase
            .from('plans')
            .select('id', COUNT_ONLY)
            .eq('service_type_id', id)
            .gte('date', todayISODate()),
        ),
        countRows(
          supabase
            .from('plan_assignments')
            .select('id, plans!inner(service_type_id)', COUNT_ONLY)
            .eq('plans.service_type_id', id),
        ),
        countRows(
          supabase
            .from('plan_attachments')
            .select('id, plans!inner(service_type_id)', COUNT_ONLY)
            .eq('plans.service_type_id', id),
        ),
        countRows(
          supabase
            .from('plan_templates')
            .select('id', COUNT_ONLY)
            .eq('service_type_id', id),
        ),
      ])
      return { plans, upcoming, assignments, attachments, templates }
    },
  })
}
