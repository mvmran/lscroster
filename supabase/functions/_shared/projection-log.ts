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

/*
 * Refusals (401) are never rate-limited, so how many get written down is
 * capped instead; past a cap a request is still answered, just not logged.
 * The caps count what is already logged before inserting, with nothing holding
 * the two together, so they hold against a steady stream but a burst arriving
 * at once can overshoot — making them exact would take a locking database
 * function, more than a log of refusals is worth.
 */

/**
 * A revoked key's refusals logged per key per minute. Counted apart from
 * everyone else's, so a flood of keyless requests can't hide the device an
 * admin most wants to find: the one still calling with a key they revoked.
 */
export const REFUSED_PER_KEY_PER_MINUTE = 20

/** Refusals naming no known key, logged per address per minute. */
export const REFUSED_PER_IP_PER_MINUTE = 20

/**
 * Refusals naming no known key, logged per minute from everyone together. The
 * address is the first X-Forwarded-For entry, which a caller can write itself,
 * so a scanner sending a new one each time would slip the per-IP cap; this one
 * it can't.
 */
export const REFUSED_PER_MINUTE = 100

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

/**
 * Whether this minute's refusals are already logged: a revoked key's own
 * (REFUSED_PER_KEY_PER_MINUTE), or for a refusal naming no known key, this
 * address's (REFUSED_PER_IP_PER_MINUTE) or everyone's (REFUSED_PER_MINUTE).
 */
export async function refusalCapReached(
  admin: SupabaseClient,
  ip: string | null,
  keyId: string | null,
): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const refusals = () =>
    admin
      .from('projection_api_requests')
      .select('id', { count: 'exact', head: true })
      .eq('http_status', 401)
      .gte('requested_at', since)
  // A count that can't be read logs the row: losing a refusal is worse than one
  // extra line.
  const over = (result: { count: number | null; error: unknown }, cap: number) =>
    !result.error && (result.count ?? 0) >= cap
  if (keyId) {
    return over(await refusals().eq('key_id', keyId), REFUSED_PER_KEY_PER_MINUTE)
  }
  const keyless = () => refusals().is('key_id', null)
  const [fromIp, fromAll] = await Promise.all([
    ip ? keyless().eq('ip', ip) : keyless().is('ip', null),
    keyless(),
  ])
  return over(fromIp, REFUSED_PER_IP_PER_MINUTE) || over(fromAll, REFUSED_PER_MINUTE)
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
