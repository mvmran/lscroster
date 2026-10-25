// The projection API's request log (projection_api_requests, 0036 + 0072): what
// the projection-api function writes down about each answer, the cap on logged
// refusals, and the pruning the hourly reminders job does.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Why a request got its answer. The response's `error` stays as documented. */
export type ProjectionReason =
  | 'ok'
  | 'missing_key'
  | 'malformed_key'
  | 'unknown_key'
  | 'revoked_key'
  | 'rate_limited'
  | 'method_not_allowed'
  | 'not_found'
  | 'plan_not_found'
  | 'plan_not_published'
  | 'plan_outside_window'
  | 'database_error'
  | 'internal_error'

/** Failures are kept 90 days; successful requests, the CCLI usage trail, a year. */
export const FAILURE_RETENTION_DAYS = 90
export const SUCCESS_RETENTION_DAYS = 365

/**
 * Refusals logged per address per minute. A request without a working key is
 * never rate-limited, so a scanner — or a device left polling with a revoked
 * key — could otherwise fill the table; past the cap it is still answered, just
 * not written down.
 */
export const REFUSED_PER_IP_PER_MINUTE = 20

/** Trimmed and cut to `max` characters; null when there's nothing left. */
export function clip(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim() ?? ''
  return trimmed === '' ? null : trimmed.slice(0, max)
}

/**
 * The display prefix of a key nobody recognises — "lscp_" and up to six hex
 * characters, what projection_api_keys keeps for real ones — so a mistyped key
 * can be matched to the device it was meant for. Anything that isn't shaped
 * like a projection key gives null: whatever else was pasted, even its start
 * isn't ours to keep.
 */
export function keyPrefixOf(raw: string): string | null {
  return /^lscp_[0-9a-f]{0,6}/.exec(raw)?.[0] ?? null
}

/** When each kind of row becomes old enough to delete. */
export function pruneCutoffs(now: Date): { failures: string; successes: string } {
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  return {
    failures: daysAgo(FAILURE_RETENTION_DAYS),
    successes: daysAgo(SUCCESS_RETENTION_DAYS),
  }
}

/** Whether this address has already had its refusals for the minute logged. */
export async function refusalCapReached(
  admin: SupabaseClient,
  ip: string | null,
): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const base = admin
    .from('projection_api_requests')
    .select('id', { count: 'exact', head: true })
    .eq('http_status', 401)
    .gte('requested_at', since)
  const { count, error } = await (ip ? base.eq('ip', ip) : base.is('ip', null))
  // A count that can't be read logs the row: losing a refusal is worse than one
  // extra line.
  return !error && (count ?? 0) >= REFUSED_PER_IP_PER_MINUTE
}

/**
 * Delete what has outlived its retention. Run by every scheduled reminders
 * pass; returns how many rows went, or throws on a failed delete.
 */
export async function pruneProjectionRequests(
  admin: SupabaseClient,
  now = new Date(),
): Promise<number> {
  const { failures, successes } = pruneCutoffs(now)
  const [failed, succeeded] = await Promise.all([
    admin
      .from('projection_api_requests')
      .delete({ count: 'exact' })
      .gte('http_status', 400)
      .lt('requested_at', failures),
    admin
      .from('projection_api_requests')
      .delete({ count: 'exact' })
      .lt('http_status', 400)
      .lt('requested_at', successes),
  ])
  const error = failed.error ?? succeeded.error
  if (error) throw new Error(error.message)
  return (failed.count ?? 0) + (succeeded.count ?? 0)
}
