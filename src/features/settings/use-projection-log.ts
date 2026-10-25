import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { supabase } from '@/lib/supabase'

// The projection API's request log (projection_api_requests, 0036 + 0072),
// admin-readable by RLS. The function writes it; the reminders job prunes
// failures after 90 days and successful requests after a year.

/** How many days the log page covers. */
export const PROJECTION_LOG_DAYS = 30
/** The page shows at most this many rows; one more is fetched to spot overflow. */
export const PROJECTION_LOG_LIMIT = 200

export interface ProjectionLogEntry {
  id: number
  requested_at: string
  http_status: number
  reason: string | null
  endpoint: string
  path: string | null
  method: string | null
  ip: string | null
  user_agent: string | null
  key_prefix: string | null
  detail: string | null
  projection_api_keys: { label: string; revoked_at: string | null } | null
}

/** What each reason means, for people. */
const REASON_LABELS: Record<string, string> = {
  ok: 'OK',
  missing_key: 'No key sent',
  malformed_key: 'Not a projection key',
  unknown_key: 'Unknown key',
  revoked_key: 'Revoked key',
  rate_limited: 'Too many requests',
  method_not_allowed: 'Wrong method',
  not_found: 'No such address',
  plan_not_found: 'No such plan',
  plan_not_published: 'Plan not published',
  plan_outside_window: 'Plan outside the date window',
  database_error: 'Database error',
  internal_error: 'Server error',
}

/** A row's result in words; rows from before 0072 have only their status. */
export function reasonLabel(entry: Pick<ProjectionLogEntry, 'reason' | 'http_status'>) {
  if (entry.reason) return REASON_LABELS[entry.reason] ?? entry.reason
  switch (entry.http_status) {
    case 200:
      return 'OK'
    case 401:
      return 'Refused'
    case 404:
      return 'Not found'
    case 429:
      return 'Too many requests'
    case 500:
      return 'Server error'
    default:
      return `HTTP ${entry.http_status}`
  }
}

export interface ProjectionLogResult {
  rows: ProjectionLogEntry[]
  /** More rows than the page shows matched. */
  overflow: boolean
}

export function useProjectionLog(failuresOnly: boolean) {
  return useQuery({
    queryKey: ['projection-log', failuresOnly],
    queryFn: async (): Promise<ProjectionLogResult> => {
      const since = subDays(new Date(), PROJECTION_LOG_DAYS).toISOString()
      // Filtered in the query, not on screen: a device polling every minute
      // would otherwise push every failure out of the newest 200 rows.
      let query = supabase
        .from('projection_api_requests')
        .select(
          'id, requested_at, http_status, reason, endpoint, path, method, ip, user_agent, key_prefix, detail, projection_api_keys(label, revoked_at)',
        )
        .gte('requested_at', since)
      if (failuresOnly) query = query.gte('http_status', 400)
      const { data, error } = await query
        .order('requested_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PROJECTION_LOG_LIMIT + 1)
      if (error) throw new Error(error.message)
      const rows = data as ProjectionLogEntry[]
      return {
        rows: rows.slice(0, PROJECTION_LOG_LIMIT),
        overflow: rows.length > PROJECTION_LOG_LIMIT,
      }
    },
  })
}

/** Requests and failures over the page's window, as two head counts. */
export function useProjectionLogStats() {
  return useQuery({
    queryKey: ['projection-log-stats'],
    queryFn: async () => {
      const since = subDays(new Date(), PROJECTION_LOG_DAYS).toISOString()
      const [total, failed] = await Promise.all([
        supabase
          .from('projection_api_requests')
          .select('id', { count: 'exact', head: true })
          .gte('requested_at', since),
        supabase
          .from('projection_api_requests')
          .select('id', { count: 'exact', head: true })
          .gte('requested_at', since)
          .gte('http_status', 400),
      ])
      if (total.error) throw new Error(total.error.message)
      if (failed.error) throw new Error(failed.error.message)
      return { total: total.count ?? 0, failed: failed.count ?? 0 }
    },
  })
}
