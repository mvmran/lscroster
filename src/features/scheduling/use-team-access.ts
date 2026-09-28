import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { fullName } from '@/features/people/person-utils'
import { PERSON_SAFE_COLUMNS } from '@/features/people/use-people'
import type { Enums, Tables } from '@/types/database'

/** The three ordered per-team access levels (migration 0048). */
export type TeamAccess = Enums<'team_access'> // 'viewer' | 'scheduler' | 'manager'

/** Low → high, for dropdowns. */
export const TEAM_ACCESS_ORDER: readonly TeamAccess[] = ['viewer', 'scheduler', 'manager']

export const TEAM_ACCESS_LABELS: Record<TeamAccess, string> = {
  viewer: 'Viewer',
  scheduler: 'Scheduler',
  manager: 'Manager',
}

/** One-line explanation of each level, for the Team Access card. */
export const TEAM_ACCESS_HELP: Record<TeamAccess, string> = {
  viewer: 'See the team’s members and positions and view its plans and roster.',
  scheduler: 'Also schedule members to plans and email them — but not change membership.',
  manager: 'Full control — add and remove members, edit positions, schedule and email.',
}

/** Levels that may roster a team (assign to plans, email, mute rules). */
const SCHEDULER_PLUS: ReadonlySet<TeamAccess> = new Set(['scheduler', 'manager'])

/** A grant row with the granted person embedded (team page). */
export type TeamGrantWithPerson = {
  team_id: string
  person_id: string
  access: TeamAccess
  people: Tables<'people'>
}

/** A grant row with the team embedded (person-profile card). */
export type TeamGrantWithTeam = {
  team_id: string
  person_id: string
  access: TeamAccess
  teams: Tables<'teams'>
}

const accessKeys = {
  team: (teamId: string) => ['team-grants', teamId] as const,
  mine: ['my-team-grants'] as const,
  person: ['person-team-grants'] as const,
}

/** The grants on one team, people embedded (team page). */
export function useTeamGrants(teamId: string | undefined) {
  return useQuery({
    queryKey: accessKeys.team(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_grants')
        .select(`team_id, person_id, access, people(${PERSON_SAFE_COLUMNS})`)
        .eq('team_id', teamId!)
      if (error) throw new Error(error.message)
      return (data as unknown as TeamGrantWithPerson[]).sort((a, b) =>
        fullName(a.people).localeCompare(fullName(b.people)),
      )
    },
  })
}

/** One person's grants, teams embedded (person-profile card). */
export function usePersonTeamGrants(personId: string | undefined) {
  return useQuery({
    queryKey: [...accessKeys.person, personId ?? ''],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_grants')
        .select('team_id, person_id, access, teams(*)')
        .eq('person_id', personId!)
      if (error) throw new Error(error.message)
      return (data as unknown as TeamGrantWithTeam[]).sort((a, b) =>
        a.teams.name.localeCompare(b.teams.name),
      )
    },
  })
}

/** The signed-in person's grants as a team_id → access map. */
export function useMyTeamGrants() {
  const { data: me } = useCurrentPerson()
  return useQuery({
    queryKey: [...accessKeys.mine, me?.id ?? ''],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_grants')
        .select('team_id, access')
        .eq('person_id', me!.id)
      if (error) throw new Error(error.message)
      return new Map<string, TeamAccess>(
        (data ?? []).map((r) => [r.team_id, r.access as TeamAccess]),
      )
    },
    staleTime: 60 * 1000,
  })
}

/** Grant a level to a person on a team, change it, or revoke it. */
export function useTeamGrantMutations() {
  const queryClient = useQueryClient()
  const invalidate = (teamId: string) => {
    queryClient.invalidateQueries({ queryKey: accessKeys.team(teamId) })
    queryClient.invalidateQueries({ queryKey: accessKeys.mine })
    queryClient.invalidateQueries({ queryKey: accessKeys.person })
  }
  const setAccess = useMutation({
    mutationFn: async ({
      teamId,
      personId,
      access,
    }: {
      teamId: string
      personId: string
      access: TeamAccess
    }) => {
      const { error } = await supabase
        .from('team_grants')
        .upsert(
          { team_id: teamId, person_id: personId, access },
          { onConflict: 'team_id,person_id' },
        )
      if (error) throw new Error(error.message)
      return teamId
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async ({ teamId, personId }: { teamId: string; personId: string }) => {
      const { error } = await supabase
        .from('team_grants')
        .delete()
        .eq('team_id', teamId)
        .eq('person_id', personId)
      if (error) throw new Error(error.message)
      return teamId
    },
    onSuccess: invalidate,
  })
  return { setAccess, remove }
}

export interface TeamPermissions {
  /** Global admin — manages everything. */
  isAdmin: boolean
  /** Governance tier (admin or coordinator): manages/schedules every team. */
  canGovern: boolean
  /** The signed-in person's grants (empty for governance — they need none). */
  grants: ReadonlyMap<string, TeamAccess>
  /** Manage this team's membership and positions (manager grant, or governance). */
  canManageTeam: (teamId: string) => boolean
  /** Schedule this team on plans and email them (scheduler+ grant, or governance). */
  canScheduleTeam: (teamId: string) => boolean
  /** At least read this team's roster (any grant, or governance). */
  canViewTeam: (teamId: string) => boolean
  /** Can schedule at least one team — gates the Matrix and scheduling entry. */
  canScheduleAny: boolean
}

const EMPTY: ReadonlyMap<string, TeamAccess> = new Map()

/**
 * Per-team permissions for the signed-in person. Coordinators and admins govern
 * every team, so they need no grant; a member's reach comes entirely from their
 * team_grants. The callbacks are stable for use in `useMemo`/`useCallback` deps.
 */
export function useTeamPermissions(): TeamPermissions {
  const { data: me } = useCurrentPerson()
  const { data: grantMap } = useMyTeamGrants()

  const isAdmin = me?.role === 'admin'
  const canGovern = me?.role === 'admin' || me?.role === 'coordinator'
  const grants = grantMap ?? EMPTY

  const canManageTeam = useCallback(
    (teamId: string) => canGovern || grants.get(teamId) === 'manager',
    [canGovern, grants],
  )
  const canScheduleTeam = useCallback(
    (teamId: string) => canGovern || SCHEDULER_PLUS.has(grants.get(teamId) as TeamAccess),
    [canGovern, grants],
  )
  const canViewTeam = useCallback(
    (teamId: string) => canGovern || grants.has(teamId),
    [canGovern, grants],
  )
  const canScheduleAny = useMemo(
    () => canGovern || [...grants.values()].some((a) => SCHEDULER_PLUS.has(a)),
    [canGovern, grants],
  )

  return {
    isAdmin,
    canGovern,
    grants,
    canManageTeam,
    canScheduleTeam,
    canViewTeam,
    canScheduleAny,
  }
}
