import type { PersonFormValues } from '@/features/people/person-form'
import { formatPhone } from '@/features/people/phone-utils'
import type { Person } from '@/features/people/use-people'
import type { Enums, TablesInsert } from '@/types/database'

export function fullName(person: Pick<Person, 'first_name' | 'last_name'>) {
  return `${person.first_name} ${person.last_name}`.trim()
}

export function initials(person: Pick<Person, 'first_name' | 'last_name'>) {
  return `${person.first_name[0] ?? ''}${person.last_name[0] ?? ''}`.toUpperCase()
}

export const ROLE_LABELS: Record<Enums<'app_role'>, string> = {
  admin: 'Admin',
  leader: 'Leader',
  member: 'Member',
}

export const ROLES = ['admin', 'leader', 'member'] as const

/**
 * Display-only account state for the People screen (issue #43):
 * - `inactive` — archived record (hidden from the directory by default)
 * - `pending`  — active record with no sign-in access yet; needs an email
 *   invite (the common state straight after a bulk CSV import), or a managing
 *   member who hasn't confirmed yet (issue #89)
 * - `active`   — active record with a login, or a confirmed managing member
 */
export type AccountStatus = 'active' | 'pending' | 'inactive'

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive',
}

export function accountStatus(
  person: Pick<
    Person,
    'status' | 'auth_user_id' | 'managed_by_person_id' | 'managed_accepted_at'
  >,
): AccountStatus {
  if (person.status === 'inactive') return 'inactive'
  if (person.auth_user_id) return 'active'
  // A managed person is active once their manager has confirmed (issue #89).
  if (person.managed_by_person_id && person.managed_accepted_at) return 'active'
  return 'pending'
}

export function personToFormValues(person: Person): PersonFormValues {
  return {
    firstName: person.first_name,
    lastName: person.last_name,
    email: person.email ?? '',
    phone: person.phone ?? '',
    birthday: person.birthday ?? '',
    notes: person.notes ?? '',
    role: person.role,
  }
}

export function formValuesToPerson(
  values: PersonFormValues,
): TablesInsert<'people'> {
  return {
    first_name: values.firstName,
    last_name: values.lastName,
    email: values.email || null,
    phone: formatPhone(values.phone) || null,
    birthday: values.birthday || null,
    notes: values.notes || null,
    role: values.role,
  }
}
