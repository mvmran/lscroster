import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import type { PlanItem } from '@/features/services/service-utils'

export type PlanTemplate = Tables<'plan_templates'>

/** Times saved alongside a template's order of service (issue #73). */
export type TemplateTime = { label: string; start_time: string; sort_order: number }

/** Per-position minimum-required overrides saved on a template (issue #110). */
export type TemplateMinCount = { position_id: string; min_count: number }

/** A plan's order of service as template rows (positions follow the list). */
function templateItemRows(items: PlanItem[]) {
  return items.map((item, index) => ({
    sort_order: index,
    kind: item.kind,
    title: item.title,
    arrangement_id: item.arrangement_id,
    key_override: item.key_override,
    bpm_override: item.bpm_override,
    reference_url: item.reference_url,
    sequence: item.sequence,
    length_seconds: item.length_seconds,
    description: item.description,
  }))
}

export const planTemplatesKey = ['plan-templates'] as const

/**
 * Templates are coordinator/admin-only by RLS; members get an empty list, which is
 * fine because the UI that uses them is coordinator-gated anyway.
 */
export function usePlanTemplates() {
  return useQuery({
    queryKey: planTemplatesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_templates')
        .select('*')
        .order('name')
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 60 * 1000,
  })
}

/** Snapshot a plan's order of service as a reusable template. */
export function useSaveAsTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      serviceTypeId,
      startTime = null,
      items,
      times = [],
      minCounts = [],
    }: {
      name: string
      serviceTypeId: string
      /** The plan's start-time override, carried onto plans made from this. */
      startTime?: string | null
      items: PlanItem[]
      times?: TemplateTime[]
      /** Per-position minimum overrides on the source plan (issue #110). */
      minCounts?: TemplateMinCount[]
    }) => {
      // One transaction (`save_plan_template`, 0067): the template and its
      // items, times and minimums all land, or none do.
      const { data: id, error } = await supabase.rpc('save_plan_template', {
        p_template: { name, service_type_id: serviceTypeId, start_time: startTime },
        p_items: templateItemRows(items),
        p_times: times,
        p_min_counts: minCounts,
      })
      if (error) throw new Error(error.message)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planTemplatesKey })
    },
  })
}

/** Overwrite an existing template's name, order of service, times and minimums (issue #61). */
export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      name,
      startTime = null,
      items,
      times = [],
      minCounts = [],
    }: {
      id: string
      name: string
      startTime?: string | null
      items: PlanItem[]
      times?: TemplateTime[]
      minCounts?: TemplateMinCount[]
    }) => {
      // One transaction (`save_plan_template`, 0067): a failure partway used
      // to leave the template renamed with no order of service.
      const { error } = await supabase.rpc('save_plan_template', {
        p_template_id: id,
        p_template: { name, start_time: startTime },
        p_items: templateItemRows(items),
        p_times: times,
        p_min_counts: minCounts,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planTemplatesKey })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plan_templates').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planTemplatesKey })
    },
  })
}
