import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type TeamWithCounts = Tables<'teams'> & {
  positions: { count: number }[]
  team_members: { count: number }[]
}

export type TeamMemberWithPerson = Tables<'team_members'> & {
  people: Tables<'people'>
}

/** One position a member can fill, with the position row embedded. */
export type MembershipPosition = {
  position_id: string
  positions: Tables<'positions'>
}

export type TeamMemberWithPositions = TeamMemberWithPerson & {
  team_member_positions: MembershipPosition[]
}

export const teamKeys = {
  all: ['teams'] as const,
  detail: (id: string) => ['teams', id] as const,
  positions: (teamId: string) => ['positions', teamId] as const,
  members: (teamId: string) => ['team-members', teamId] as const,
  membershipsOf: (personId: string) => ['memberships', personId] as const,
}

export function useTeams() {
  return useQuery({
    queryKey: teamKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*, positions(count), team_members(count)')
        .order('sort_order')
        .order('name')
      if (error) throw new Error(error.message)
      return data as TeamWithCounts[]
    },
    staleTime: 60 * 1000,
  })
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: teamKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function usePositions(teamId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.positions(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('team_id', teamId!)
        .order('sort_order')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** Every team's positions in one query (scheduling panel needs all of them). */
export function useAllPositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 60 * 1000,
  })
}

/** Every membership with person embedded (scheduling panel pickers). */
export function useAllTeamMembers() {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*, people(*)')
      if (error) throw new Error(error.message)
      return data as TeamMemberWithPerson[]
    },
    staleTime: 60 * 1000,
  })
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.members(teamId ?? ''),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*, people(*), team_member_positions(position_id, positions(*))')
        .eq('team_id', teamId!)
      if (error) throw new Error(error.message)
      return (data as TeamMemberWithPositions[]).sort((a, b) =>
        `${a.people.first_name} ${a.people.last_name}`.localeCompare(
          `${b.people.first_name} ${b.people.last_name}`,
        ),
      )
    },
  })
}

export type MembershipWithTeam = Tables<'team_members'> & {
  teams: Tables<'teams'>
  team_member_positions: MembershipPosition[]
}

/** A person's team memberships (person profile card). */
export function useMembershipsOf(personId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.membershipsOf(personId ?? ''),
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*, teams(*), team_member_positions(position_id, positions(*))')
        .eq('person_id', personId!)
      if (error) throw new Error(error.message)
      return data as MembershipWithTeam[]
    },
  })
}

function useInvalidateTeams() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: teamKeys.all })
}

export function useCreateTeam() {
  const invalidate = useInvalidateTeams()
  return useMutation({
    mutationFn: async (values: TablesInsert<'teams'>) => {
      const { data, error } = await supabase
        .from('teams')
        .insert(values)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'teams'>
    }) => {
      const { data, error } = await supabase
        .from('teams')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all })
      queryClient.invalidateQueries({ queryKey: teamKeys.detail(team.id) })
    },
  })
}

export function useDeleteTeam() {
  const invalidate = useInvalidateTeams()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('teams').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function usePositionMutations(teamId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: teamKeys.positions(teamId) })
    queryClient.invalidateQueries({ queryKey: ['positions'] })
    queryClient.invalidateQueries({ queryKey: teamKeys.all })
  }
  const create = useMutation({
    mutationFn: async (values: Omit<TablesInsert<'positions'>, 'team_id'>) => {
      const { error } = await supabase
        .from('positions')
        .insert({ ...values, team_id: teamId })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TablesUpdate<'positions'>
    }) => {
      const { error } = await supabase
        .from('positions')
        .update(values)
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('positions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
  return { create, update, remove }
}

export function useMembershipMutations() {
  const queryClient = useQueryClient()
  const invalidate = (teamId: string, personId: string) => {
    queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) })
    queryClient.invalidateQueries({ queryKey: teamKeys.membershipsOf(personId) })
    queryClient.invalidateQueries({ queryKey: teamKeys.all })
  }
  const add = useMutation({
    mutationFn: async (values: TablesInsert<'team_members'>) => {
      const { data, error } = await supabase
        .from('team_members')
        .insert(values)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (m) => invalidate(m.team_id, m.person_id),
  })
  const addPosition = useMutation({
    mutationFn: async ({
      member,
      positionId,
    }: {
      member: Tables<'team_members'>
      positionId: string
    }) => {
      const { error } = await supabase
        .from('team_member_positions')
        .insert({ team_member_id: member.id, position_id: positionId })
      if (error) throw new Error(error.message)
      return member
    },
    onSuccess: (m) => invalidate(m.team_id, m.person_id),
  })
  const removePosition = useMutation({
    mutationFn: async ({
      member,
      positionId,
    }: {
      member: Tables<'team_members'>
      positionId: string
    }) => {
      const { error } = await supabase
        .from('team_member_positions')
        .delete()
        .eq('team_member_id', member.id)
        .eq('position_id', positionId)
      if (error) throw new Error(error.message)
      return member
    },
    onSuccess: (m) => invalidate(m.team_id, m.person_id),
  })
  const setLeader = useMutation({
    mutationFn: async ({
      member,
      isLeader,
    }: {
      member: Tables<'team_members'>
      isLeader: boolean
    }) => {
      const { data, error } = await supabase
        .from('team_members')
        .update({ is_leader: isLeader })
        .eq('id', member.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (m) => invalidate(m.team_id, m.person_id),
  })
  const remove = useMutation({
    mutationFn: async (member: Tables<'team_members'>) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', member.id)
      if (error) throw new Error(error.message)
      return member
    },
    onSuccess: (m) => invalidate(m.team_id, m.person_id),
  })
  return { add, addPosition, removePosition, setLeader, remove }
}
