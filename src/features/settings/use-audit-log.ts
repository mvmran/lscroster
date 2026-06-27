import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type AuditEntry = Tables<'audit_log'>

/** The screen caps at 200 rows; we fetch one extra to detect an overflow. */
export const AUDIT_ROW_LIMIT = 200

/** Human labels for each audited event (issue #116). Order drives the filter. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'person.add': 'Person added',
  'person.archive': 'Person archived',
  'person.reactivate': 'Person reactivated',
  'person.delete': 'Person deleted',
  'person.role_change': 'Role changed',
  'team.member_add': 'Added to team',
  'team.member_remove': 'Removed from team',
  'team.leader_add': 'Team leader added',
  'team.leader_remove': 'Team leader removed',
  'team.viewer_add': 'Team viewer added',
  'team.viewer_remove': 'Team viewer removed',
}

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS)

export interface AuditFilters {
  /** ISO timestamps bounding created_at (inclusive). */
  from: string
  to: string
  action: string | 'all'
  /** Free-text match on the affected person's name. */
  target: string
  /** Free-text match on the acting user's name. */
  actor: string
}

export interface AuditResult {
  rows: AuditEntry[]
  /** True when the date range held more than 200 rows (ask to narrow). */
  overflow: boolean
}

export function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: async (): Promise<AuditResult> => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .gte('created_at', filters.from)
        .lte('created_at', filters.to)
        .order('created_at', { ascending: false })
        .limit(AUDIT_ROW_LIMIT + 1)

      if (filters.action !== 'all') query = query.eq('action', filters.action)
      const target = filters.target.trim()
      if (target) query = query.ilike('target_label', `%${target}%`)
      const actor = filters.actor.trim()
      if (actor) query = query.ilike('actor_label', `%${actor}%`)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      const rows = data ?? []
      return {
        rows: rows.slice(0, AUDIT_ROW_LIMIT),
        overflow: rows.length > AUDIT_ROW_LIMIT,
      }
    },
  })
}
