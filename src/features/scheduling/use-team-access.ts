import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { fullName } from '@/features/people/person-utils'
import { PERSON_SAFE_COLUMNS } from '@/features/people/use-people'
import type { Tables } from '@/types/database'

/** A per-team grant row (leader or viewer) with the granted person embedded. */
export type TeamGrantWithPerson = {
  id: string
  team_id: string
  person_id: string
  people: Tables<'people'>
}

/** A per-team grant row with the team embedded (for the person-profile cards). */
export type TeamGrantWithTeam = {
  id: string
  team_id: string
  person_id: string
  teams: Tables<'teams'>
}

type GrantTable = 'team_leaders' | 'team_viewers'

const accessKeys = {
  leaders: (teamId: string) => ['team-leaders', teamId] as const,
  viewers: (teamId: string) => ['team-viewers', teamId] as const,
  myLed: ['my-led-teams'] as const,
  myViewed: ['my-viewed-teams'] as const,
  personLed: ['person-led-teams'] as const,
  personViewed: ['person-viewed-teams'] as const,
}

function useGrantList(table: GrantTable, teamId: string | undefined) {
  return useQuery({
    queryKey:
      table === 'team_leaders'
        ? accessKeys.leaders(teamId ?? '')
        : accessKeys.viewers(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select(`id, team_id, person_id, people(${PERSON_SAFE_COLUMNS})`)
        .eq('team_id', teamId!)
      if (error) throw new Error(error.message)
      return (data as TeamGrantWithPerson[]).sort((a, b) =>
        fullName(a.people).localeCompare(fullName(b.people)),
      )
    },
  })
}

/** The Team Leaders of one team (team page). */
export function useTeamLeaders(teamId: string | undefined) {
  return useGrantList('team_leaders', teamId)
}

/** The Team Viewers of one team (team page). */
export function useTeamViewers(teamId: string | undefined) {
  return useGrantList('team_viewers', teamId)
}

function useMyGrantSet(table: GrantTable, key: readonly string[]) {
  const { data: me } = useCurrentPerson()
  return useQuery({
    queryKey: [...key, me?.id ?? ''],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('team_id')
        .eq('person_id', me!.id)
      if (error) throw new Error(error.message)
      return new Set((data ?? []).map((r) => r.team_id))
    },
    staleTime: 60 * 1000,
  })
}

/** team_ids the signed-in person is a Team Leader of. */
export function useMyLedTeams() {
  return useMyGrantSet('team_leaders', accessKeys.myLed)
}

/** team_ids the signed-in person is a Team Viewer of. */
export function useMyViewedTeams() {
  return useMyGrantSet('team_viewers', accessKeys.myViewed)
}

function usePersonGrantList(table: GrantTable, personId: string | undefined) {
  const key =
    table === 'team_leaders' ? accessKeys.personLed : accessKeys.personViewed
  return useQuery({
    queryKey: [...key, personId ?? ''],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('id, team_id, person_id, teams(*)')
        .eq('person_id', personId!)
      if (error) throw new Error(error.message)
      return (data as TeamGrantWithTeam[]).sort((a, b) =>
        a.teams.name.localeCompare(b.teams.name),
      )
    },
  })
}

/** The teams one person is a Team Leader of (person-profile card). */
export function usePersonLedTeams(personId: string | undefined) {
  return usePersonGrantList('team_leaders', personId)
}

/** The teams one person is a Team Viewer of (person-profile card). */
export function usePersonViewedTeams(personId: string | undefined) {
  return usePersonGrantList('team_viewers', personId)
}

function useGrantMutations(table: GrantTable) {
  const queryClient = useQueryClient()
  const listKey = table === 'team_leaders' ? 'team-leaders' : 'team-viewers'
  const mineKey = table === 'team_leaders' ? accessKeys.myLed : accessKeys.myViewed
  const personKey =
    table === 'team_leaders' ? accessKeys.personLed : accessKeys.personViewed
  const invalidate = (teamId: string) => {
    queryClient.invalidateQueries({ queryKey: [listKey, teamId] })
    // A person can grant/revoke their own access, so refresh the "mine" sets too.
    queryClient.invalidateQueries({ queryKey: mineKey })
    // Refresh the person-profile cards (keyed by person) — prefix match.
    queryClient.invalidateQueries({ queryKey: personKey })
  }
  const add = useMutation({
    mutationFn: async ({ teamId, personId }: { teamId: string; personId: string }) => {
      const { error } = await supabase
        .from(table)
        .insert({ team_id: teamId, person_id: personId })
      if (error) throw new Error(error.message)
      return teamId
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async ({ teamId, personId }: { teamId: string; personId: string }) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('team_id', teamId)
        .eq('person_id', personId)
      if (error) throw new Error(error.message)
      return teamId
    },
    onSuccess: invalidate,
  })
  return { add, remove }
}

export function useTeamLeaderMutations() {
  return useGrantMutations('team_leaders')
}

export function useTeamViewerMutations() {
  return useGrantMutations('team_viewers')
}

export interface TeamPermissions {
  /** Global admin — manages everything. */
  isAdmin: boolean
  /** Governance tier (admin or global leader): create teams, appoint grants. */
  canGovern: boolean
  ledTeamIds: Set<string>
  viewedTeamIds: Set<string>
  /** May manage this team's content (positions, members, assignments). */
  canManageTeam: (teamId: string) => boolean
  /** May at least read this team's roster on a plan. */
  canViewTeam: (teamId: string) => boolean
}

const EMPTY = new Set<string>()

/**
 * Per-team permissions for the signed-in person. `canManageTeam`/`canViewTeam`
 * are stable callbacks so callers can use them in `useMemo`/`useCallback` deps.
 */
export function useTeamPermissions(): TeamPermissions {
  const { data: me } = useCurrentPerson()
  const { data: led } = useMyLedTeams()
  const { data: viewed } = useMyViewedTeams()

  const isAdmin = me?.role === 'admin'
  const canGovern = me?.role === 'admin' || me?.role === 'leader'
  const ledTeamIds = led ?? EMPTY
  const viewedTeamIds = viewed ?? EMPTY

  const canManageTeam = useCallback(
    (teamId: string) => isAdmin || ledTeamIds.has(teamId),
    [isAdmin, ledTeamIds],
  )
  const canViewTeam = useCallback(
    (teamId: string) => isAdmin || ledTeamIds.has(teamId) || viewedTeamIds.has(teamId),
    [isAdmin, ledTeamIds, viewedTeamIds],
  )

  return { isAdmin, canGovern, ledTeamIds, viewedTeamIds, canManageTeam, canViewTeam }
}
