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
  role: 'admin' | 'leader' | 'member'
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

/** team_ids the person is a Team Leader of (empty for non-leaders). */
export async function getLedTeamIds(
  admin: SupabaseClient,
  personId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from('team_leaders')
    .select('team_id')
    .eq('person_id', personId)
  return new Set((data ?? []).map((r) => r.team_id as string))
}

/**
 * Authorises a caller to manage plan assignments for a set of teams. Admins may
 * manage any team; everyone else only the teams they are a Team Leader of. The
 * returned predicate mirrors the `can_manage_team()` RLS helper so Edge
 * Functions (which run with the service role and bypass RLS) enforce the same
 * per-team boundary. Returns null when the caller manages no team at all.
 */
export async function teamScopeFor(
  admin: SupabaseClient,
  caller: CallerPerson,
): Promise<{ canManageTeam: (teamId: string) => boolean } | null> {
  if (caller.role === 'admin') return { canManageTeam: () => true }
  const ledTeamIds = await getLedTeamIds(admin, caller.id)
  if (ledTeamIds.size === 0) return null
  return { canManageTeam: (teamId: string) => ledTeamIds.has(teamId) }
}
