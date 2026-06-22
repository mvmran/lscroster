import { describe, expect, it } from 'vitest'
import { accountStatus } from '@/features/people/person-utils'

type StatusInput = Parameters<typeof accountStatus>[0]

function person(over: Partial<StatusInput>): StatusInput {
  return {
    status: 'active',
    auth_user_id: null,
    managed_by_person_id: null,
    managed_accepted_at: null,
    ...over,
  }
}

describe('accountStatus', () => {
  it('is inactive when archived, regardless of access', () => {
    expect(accountStatus(person({ status: 'inactive', auth_user_id: 'u1' }))).toBe(
      'inactive',
    )
    expect(
      accountStatus(
        person({
          status: 'inactive',
          managed_by_person_id: 'm1',
          managed_accepted_at: '2026-01-01',
        }),
      ),
    ).toBe('inactive')
  })

  it('is active with a login of their own', () => {
    expect(accountStatus(person({ auth_user_id: 'u1' }))).toBe('active')
  })

  it('is pending when active but with no access yet', () => {
    expect(accountStatus(person({}))).toBe('pending')
  })

  // Issue #89 — managed accounts
  it('is pending while a managing member is attached but not confirmed', () => {
    expect(accountStatus(person({ managed_by_person_id: 'm1' }))).toBe('pending')
  })

  it('is active once the managing member has confirmed', () => {
    expect(
      accountStatus(
        person({ managed_by_person_id: 'm1', managed_accepted_at: '2026-06-22' }),
      ),
    ).toBe('active')
  })

  it('a stale accepted stamp without a manager is still pending (detached)', () => {
    expect(accountStatus(person({ managed_accepted_at: '2026-06-22' }))).toBe(
      'pending',
    )
  })
})
