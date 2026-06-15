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

/** How well a person can fill a position (issue #30). */
export type Proficiency = Enums<'proficiency_level'>

export const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  qualified: 'Qualified',
  trainee: 'Trainee',
}

/** The other level — proficiency is a two-state toggle for now. */
export function otherProficiency(p: Proficiency): Proficiency {
  return p === 'trainee' ? 'qualified' : 'trainee'
}

/** Badge classes for a proficiency — trainees stand out so leaders notice. */
export const PROFICIENCY_BADGE_CLASSES: Record<Proficiency, string> = {
  qualified: '',
  trainee:
    'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
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

/**
 * Do two services on the same day clash in time? (issue #14)
 *
 * Times are 'HH:MM:SS' strings, so lexicographic compare is chronological.
 * A service with no end time is treated as a point in time, so two such
 * services only clash when they start at exactly the same time — being on two
 * services the same day at different times is fine. When a start time is
 * unknown we can't rule out a clash, so we warn (conservative).
 */
export function timesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!aStart || !bStart) return true
  const ae = aEnd ?? aStart
  const be = bEnd ?? bStart
  const aIsPoint = ae <= aStart
  const bIsPoint = be <= bStart
  if (aIsPoint && bIsPoint) return aStart === bStart
  return aStart < be && bStart < ae
}
