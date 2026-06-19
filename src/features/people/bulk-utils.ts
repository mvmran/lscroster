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

/**
 * Why a bulk action can't run on a person, or null if it can. Invite needs an
 * email address and no existing login (and skips archived people); archive
 * skips already-archived people and never targets yourself.
 */
export function bulkSkipReason(
  action: BulkAction,
  person: Pick<Person, 'id' | 'email' | 'auth_user_id' | 'status'>,
  selfId: string | undefined,
): string | null {
  if (action === 'invite') {
    if (person.status === 'inactive') return 'archived'
    if (!person.email) return 'no email address'
    if (person.auth_user_id) return 'already has sign-in access'
    return null
  }
  // archive
  if (person.id === selfId) return "can't archive yourself"
  if (person.status === 'inactive') return 'already archived'
  return null
}

/** Split selected people into those an action runs on and those it skips. */
export function partitionBulk<T extends Pick<Person, 'id' | 'email' | 'auth_user_id' | 'status'>>(
  action: BulkAction,
  people: T[],
  selfId: string | undefined,
): { eligible: T[]; skipped: { person: T; reason: string }[] } {
  const eligible: T[] = []
  const skipped: { person: T; reason: string }[] = []
  for (const person of people) {
    const reason = bulkSkipReason(action, person, selfId)
    if (reason) skipped.push({ person, reason })
    else eligible.push(person)
  }
  return { eligible, skipped }
}
