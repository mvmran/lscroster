import type { PersonFormValues } from '@/features/people/person-form'
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
    phone: values.phone || null,
    birthday: values.birthday || null,
    notes: values.notes || null,
    role: values.role,
  }
}
