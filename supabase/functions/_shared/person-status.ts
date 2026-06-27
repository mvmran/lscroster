// Account-status gate for outbound email (issue #126). The person_status enum
// is only active/inactive, but the People screen also derives a "pending" state
// for active records that have no sign-in yet (no auth_user_id, and — for a
// managed member — no confirmed manager). Automated email must go only to truly
// *active* people: never to pending (invitation not yet accepted) or inactive
// (archived) records. Mirrors src/features/people/person-utils.ts accountStatus.

export interface AccountStatusPerson {
  status: string
  auth_user_id?: string | null
  managed_by_person_id: string | null
  managed_accepted_at?: string | null
}

/** True only when the person is active *and* has accepted access (own login or
 *  confirmed managing member). Pending and inactive records return false. */
export function isEmailableActive(p: AccountStatusPerson): boolean {
  if (p.status !== 'active') return false
  if (p.auth_user_id) return true
  if (p.managed_by_person_id && p.managed_accepted_at) return true
  return false
}
