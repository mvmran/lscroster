import type { Person } from '@/features/people/use-people'

/** The bulk actions offered on the People page (issue #77, admin-only). */
export type BulkAction = 'invite' | 'archive'

export const BULK_ACTION_LABELS: Record<BulkAction, string> = {
  invite: 'Send invitation',
  archive: 'Archive member',
}

/** Verb phrase for the confirm dialog, e.g. "Send invitation to 3 members?". */
export function bulkConfirmQuestion(action: BulkAction, count: number): string {
  const members = `${count} member${count === 1 ? '' : 's'}`
  return action === 'invite'
    ? `Send invitation to ${members}?`
    : `Archive ${members}?`
}

type BulkPerson = Pick<
  Person,
  'id' | 'email' | 'auth_user_id' | 'status' | 'managed_by_person_id' | 'managed_accepted_at'
>

/**
 * Why a bulk action can't run on a person, or null if it can. Invite skips
 * archived people and anyone with a login; a managed account goes to its
 * managing member (as on the person page), so it needs no email of its own
 * but is skipped once the manager has confirmed; anyone else needs an email
 * address. Archive
 * skips already-archived people, never targets yourself, and skips anyone who
 * manages another member (`managerIds`) — the person page blocks that too,
 * since the managed member would be left with a manager who can't sign in.
 */
export function bulkSkipReason(
  action: BulkAction,
  person: BulkPerson,
  selfId: string | undefined,
  managerIds: ReadonlySet<string> = new Set(),
): string | null {
  if (action === 'invite') {
    if (person.status === 'inactive') return 'archived'
    if (person.auth_user_id) return 'already has sign-in access'
    if (person.managed_by_person_id) {
      return person.managed_accepted_at ? 'managing member already confirmed' : null
    }
    if (!person.email) return 'no email address'
    return null
  }
  // archive
  if (person.id === selfId) return "can't archive yourself"
  if (person.status === 'inactive') return 'already archived'
  if (managerIds.has(person.id)) return 'manages another member — remove that link first'
  return null
}

/** Split selected people into those an action runs on and those it skips. */
export function partitionBulk<T extends BulkPerson>(
  action: BulkAction,
  people: T[],
  selfId: string | undefined,
  managerIds: ReadonlySet<string> = new Set(),
): { eligible: T[]; skipped: { person: T; reason: string }[] } {
  const eligible: T[] = []
  const skipped: { person: T; reason: string }[] = []
  for (const person of people) {
    const reason = bulkSkipReason(action, person, selfId, managerIds)
    if (reason) skipped.push({ person, reason })
    else eligible.push(person)
  }
  return { eligible, skipped }
}

/**
 * The lines of a bulk action's failure toast: each person and the reason the
 * server gave, up to `max`, then how many more.
 */
export function describeBulkFailures(
  failures: { name: string; message: string }[],
  max = 5,
): string[] {
  const lines = failures.slice(0, max).map((f) => `${f.name}: ${f.message}`)
  if (failures.length > max) lines.push(`and ${failures.length - max} more`)
  return lines
}
