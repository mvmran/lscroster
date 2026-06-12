import type { Enums, Tables } from '@/types/database'

export type Team = Tables<'teams'>
export type Position = Tables<'positions'>
export type TeamMember = Tables<'team_members'>
export type PlanAssignment = Tables<'plan_assignments'>
export type BlockoutDate = Tables<'blockout_dates'>
export type AssignmentStatus = Enums<'assignment_status'>

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

/** Badge classes per status — the at-a-glance colour coding on plans. */
export const ASSIGNMENT_STATUS_CLASSES: Record<AssignmentStatus, string> = {
  pending:
    'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  confirmed:
    'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  declined: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
}

export function isBlockedOut(
  blockouts: Pick<BlockoutDate, 'person_id' | 'start_date' | 'end_date'>[],
  personId: string,
  date: string,
) {
  return blockouts.some(
    (b) => b.person_id === personId && b.start_date <= date && b.end_date >= date,
  )
}
