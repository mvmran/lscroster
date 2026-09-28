// Caller identification for Edge Functions: resolves the Authorization header
// to the caller's `people` row (or null).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Service-role client (bypasses RLS). Pass `actorPersonId` to attribute any
 * audited writes (people/team changes) to that person: it travels as an
 * `x-audit-actor` header that the audit triggers trust *only* for service-role
 * requests (issue #116). Browser writes are attributed via the JWT instead.
 */
export function serviceClient(actorPersonId?: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
      ...(actorPersonId
        ? { global: { headers: { 'x-audit-actor': actorPersonId } } }
        : {}),
    },
  )
}

export interface CallerPerson {
  id: string
  first_name: string
  last_name: string
  email: string | null
  role: 'admin' | 'coordinator' | 'member'
}

export async function getCallerPerson(
  req: Request,
  admin: SupabaseClient,
): Promise<CallerPerson | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  )
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return null

  const { data: person } = await admin
    .from('people')
    .select('id, first_name, last_name, email, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return (person as CallerPerson | null) ?? null
}

/** The grantable BAU permissions (the `app_permission` enum). */
export type AppPermission =
  | 'edit_order_of_service'
  | 'publish_plans'
  | 'create_delete_plans'
  | 'manage_songs'
  | 'attach_plan_files'
  | 'view_all_plans'

/**
 * Does the caller hold a BAU permission? Mirrors the `has_permission()` RLS
 * helper for functions that run with the service role: admins and coordinators
 * hold every permission, and create_delete_plans implies edit_order_of_service.
 */
export async function callerHasPermission(
  admin: SupabaseClient,
  caller: CallerPerson,
  permission: AppPermission,
): Promise<boolean> {
  if (caller.role === 'admin' || caller.role === 'coordinator') return true
  const accepted: AppPermission[] =
    permission === 'edit_order_of_service'
      ? [permission, 'create_delete_plans']
      : [permission]
  const { data } = await admin
    .from('person_permissions')
    .select('permission')
    .eq('person_id', caller.id)
    .in('permission', accepted)
    .limit(1)
  return (data ?? []).length > 0
}

/** team_ids the person may schedule — a Scheduler or Manager grant (migration
 * 0048); empty for viewers and the ungranted. */
export async function getScheduleTeamIds(
  admin: SupabaseClient,
  personId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from('team_grants')
    .select('team_id')
    .eq('person_id', personId)
    .in('access', ['scheduler', 'manager'])
  return new Set((data ?? []).map((r) => r.team_id as string))
}

/**
 * Authorises a caller to schedule plan assignments for a set of teams (send and
 * cancel requests). Admins and coordinators govern every team church-wide;
 * everyone else only the teams they hold a Scheduler or Manager grant on. The
 * returned predicate mirrors the `can_schedule_team()` RLS helper so Edge
 * Functions (which run with the service role and bypass RLS) enforce the same
 * per-team boundary. Returns null when the caller can schedule no team at all.
 */
export async function teamScopeFor(
  admin: SupabaseClient,
  caller: CallerPerson,
): Promise<{ canScheduleTeam: (teamId: string) => boolean } | null> {
  if (caller.role === 'admin' || caller.role === 'coordinator') {
    return { canScheduleTeam: () => true }
  }
  const teamIds = await getScheduleTeamIds(admin, caller.id)
  if (teamIds.size === 0) return null
  return { canScheduleTeam: (teamId: string) => teamIds.has(teamId) }
}
