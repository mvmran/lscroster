import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import type { PlanItem } from '@/features/services/service-utils'

export type PlanTemplate = Tables<'plan_templates'>

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
      items,
    }: {
      name: string
      serviceTypeId: string
      items: PlanItem[]
    }) => {
      const { data: template, error } = await supabase
        .from('plan_templates')
        .insert({ name, service_type_id: serviceTypeId })
        .select()
        .single()
      if (error) throw new Error(error.message)

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
        if (itemsError) {
          await supabase.from('plan_templates').delete().eq('id', template.id)
          throw new Error(itemsError.message)
        }
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
      items,
    }: {
      id: string
      name: string
      items: PlanItem[]
    }) => {
      const { error: nameError } = await supabase
        .from('plan_templates')
        .update({ name })
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
