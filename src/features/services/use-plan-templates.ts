import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import type { PlanItem } from '@/features/services/service-utils'

export type PlanTemplate = Tables<'plan_templates'>

/** Times saved alongside a template's order of service (issue #73). */
export type TemplateTime = { label: string; start_time: string; sort_order: number }

/** Per-position minimum-required overrides saved on a template (issue #110). */
export type TemplateMinCount = { position_id: string; min_count: number }

async function replaceTemplateTimes(templateId: string, times: TemplateTime[]) {
  const { error: clearError } = await supabase
    .from('plan_template_times')
    .delete()
    .eq('template_id', templateId)
  if (clearError) throw new Error(clearError.message)
  if (times.length > 0) {
    const { error } = await supabase
      .from('plan_template_times')
      .insert(times.map((t) => ({ ...t, template_id: templateId })))
    if (error) throw new Error(error.message)
  }
}

async function replaceTemplateMinCounts(
  templateId: string,
  minCounts: TemplateMinCount[],
) {
  const { error: clearError } = await supabase
    .from('plan_template_position_min_counts')
    .delete()
    .eq('template_id', templateId)
  if (clearError) throw new Error(clearError.message)
  if (minCounts.length > 0) {
    const { error } = await supabase
      .from('plan_template_position_min_counts')
      .insert(minCounts.map((m) => ({ ...m, template_id: templateId })))
    if (error) throw new Error(error.message)
  }
}

export const planTemplatesKey = ['plan-templates'] as const

/**
 * Templates are leader/admin-only by RLS; members get an empty list, which is
 * fine because the UI that uses them is leader-gated anyway.
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
      const { data: template, error } = await supabase
        .from('plan_templates')
        .insert({ name, service_type_id: serviceTypeId, start_time: startTime })
        .select()
        .single()
      if (error) throw new Error(error.message)

      try {
        if (items.length > 0) {
          const rows = items.map((item, index) => ({
            template_id: template.id,
            sort_order: index,
            kind: item.kind,
            title: item.title,
            song_id: item.song_id,
            key_override: item.key_override,
            length_seconds: item.length_seconds,
            description: item.description,
          }))
          const { error: itemsError } = await supabase
            .from('plan_template_items')
            .insert(rows)
          if (itemsError) throw new Error(itemsError.message)
        }
        await replaceTemplateTimes(template.id, times)
        await replaceTemplateMinCounts(template.id, minCounts)
      } catch (e) {
        await supabase.from('plan_templates').delete().eq('id', template.id)
        throw e
      }
      return template
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planTemplatesKey })
    },
  })
}

/** Overwrite an existing template's name and order of service (issue #61). */
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
      const { error: nameError } = await supabase
        .from('plan_templates')
        .update({ name, start_time: startTime })
        .eq('id', id)
      if (nameError) throw new Error(nameError.message)

      // Replace the template's items wholesale with the current order of service.
      const { error: clearError } = await supabase
        .from('plan_template_items')
        .delete()
        .eq('template_id', id)
      if (clearError) throw new Error(clearError.message)

      if (items.length > 0) {
        const rows = items.map((item, index) => ({
          template_id: id,
          sort_order: index,
          kind: item.kind,
          title: item.title,
          song_id: item.song_id,
          key_override: item.key_override,
          length_seconds: item.length_seconds,
          description: item.description,
        }))
        const { error: itemsError } = await supabase
          .from('plan_template_items')
          .insert(rows)
        if (itemsError) throw new Error(itemsError.message)
      }

      // Times follow the same wholesale-replace as items (issue #73).
      await replaceTemplateTimes(id, times)
      // Per-position minimum overrides too (issue #110).
      await replaceTemplateMinCounts(id, minCounts)
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
