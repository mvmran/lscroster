import { STATUS_SOFT } from '@/lib/status'
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

// --- Scheduling rules (issue #32, phase 1) ---------------------------------

export type SchedulingStatus = Enums<'scheduling_status'>

export const SCHEDULING_STATUS_LABELS: Record<SchedulingStatus, string> = {
  active: 'Active',
  break: 'On a break',
  pending: 'Pending',
}

export type PairingKind = Enums<'pairing_kind'>

export const PAIRING_KIND_LABELS: Record<PairingKind, string> = {
  prefer: 'Prefers to serve with',
  avoid: 'Avoid serving with',
  together: 'Household — serve together',
}

export type PairingStrength = Enums<'pairing_strength'>

/** Cadence presets mapping to `min_gap_days` (the stored value). */
export const CADENCE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Any frequency' },
  { value: 7, label: 'At most weekly' },
  { value: 14, label: 'At most fortnightly' },
  { value: 28, label: 'At most monthly' },
]

/** Sun..Sat short labels, 0-indexed to match the stored weekday. */
export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Every Sunday", "1st Sunday", "Last Saturday" from a recurring rule. */
export function formatRecurringRule(
  weekOfMonth: number | null,
  weekday: number,
): string {
  const day = WEEKDAY_LABELS[weekday] ?? '?'
  if (weekOfMonth == null) return `Every ${day}`
  if (weekOfMonth === -1) return `Last ${day} of the month`
  const ordinal = ['1st', '2nd', '3rd', '4th', '5th'][weekOfMonth - 1] ?? `${weekOfMonth}th`
  return `${ordinal} ${day} of the month`
}

/** Normalise an unordered person pair so person_a < person_b (matches the DB check). */
export function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** Badge classes per status — the at-a-glance colour coding on plans. */
export const ASSIGNMENT_STATUS_CLASSES: Record<AssignmentStatus, string> = {
  pending: STATUS_SOFT.warning,
  confirmed: STATUS_SOFT.success,
  declined: STATUS_SOFT.danger,
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
