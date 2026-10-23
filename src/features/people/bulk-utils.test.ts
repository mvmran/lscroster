import { describe, expect, it } from 'vitest'
import {
  bulkConfirmQuestion,
  bulkSkipReason,
  describeBulkFailures,
  partitionBulk,
} from './bulk-utils'

type P = {
  id: string
  email: string | null
  auth_user_id: string | null
  status: 'active' | 'inactive'
  managed_by_person_id: string | null
  managed_accepted_at: string | null
}
const p = (over: Partial<P> & { id: string }): P => ({
  email: 'a@b.com',
  auth_user_id: null,
  status: 'active',
  managed_by_person_id: null,
  managed_accepted_at: null,
  ...over,
})

describe('bulkSkipReason — invite', () => {
  it('allows an active person with an email and no login', () => {
    expect(bulkSkipReason('invite', p({ id: '1' }), 'me')).toBeNull()
  })
  it('skips people with no email, an existing login, or archived', () => {
    expect(bulkSkipReason('invite', p({ id: '1', email: null }), 'me')).toBe('no email address')
    expect(bulkSkipReason('invite', p({ id: '1', auth_user_id: 'u' }), 'me')).toBe(
      'already has sign-in access',
    )
    expect(bulkSkipReason('invite', p({ id: '1', status: 'inactive' }), 'me')).toBe('archived')
  })
})

describe('bulkSkipReason — archive a manager', () => {
  it('skips someone who manages another member, but still invites them', () => {
    const managers = new Set(['1'])
    expect(bulkSkipReason('archive', p({ id: '1' }), 'me', managers)).toBe(
      'manages another member — remove that link first',
    )
    expect(bulkSkipReason('archive', p({ id: '2' }), 'me', managers)).toBeNull()
    expect(bulkSkipReason('invite', p({ id: '1' }), 'me', managers)).toBeNull()
  })
})

describe('bulkSkipReason — archive', () => {
  it('allows an active person who is not yourself', () => {
    expect(bulkSkipReason('archive', p({ id: '1' }), 'me')).toBeNull()
  })
  it('skips yourself and already-archived people', () => {
    expect(bulkSkipReason('archive', p({ id: 'me' }), 'me')).toBe("can't archive yourself")
    expect(bulkSkipReason('archive', p({ id: '1', status: 'inactive' }), 'me')).toBe(
      'already archived',
    )
  })
})

describe('partitionBulk', () => {
  it('splits eligible from skipped with reasons', () => {
    const people = [
      p({ id: '1' }),
      p({ id: '2', email: null }),
      p({ id: 'me' }),
    ]
    const { eligible, skipped } = partitionBulk('archive', people, 'me')
    expect(eligible.map((e) => e.id)).toEqual(['1', '2'])
    expect(skipped).toEqual([{ person: people[2], reason: "can't archive yourself" }])
  })
})

describe('bulkConfirmQuestion', () => {
  it('pluralises and names the operation', () => {
    expect(bulkConfirmQuestion('invite', 3)).toBe('Send invitation to 3 members?')
    expect(bulkConfirmQuestion('archive', 1)).toBe('Archive 1 member?')
  })
})

describe('describeBulkFailures', () => {
  const f = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1}`, message: 'Refused' }))

  it('names each person with the reason', () => {
    expect(describeBulkFailures([{ name: 'Bob Lee', message: 'Bob Lee manages Jo Lee' }]))
      .toEqual(['Bob Lee: Bob Lee manages Jo Lee'])
  })

  it('lists up to the limit, then counts the rest', () => {
    const lines = describeBulkFailures(f(8))
    expect(lines).toHaveLength(6)
    expect(lines[4]).toBe('Person 5: Refused')
    expect(lines[5]).toBe('and 3 more')
  })

  it('adds no count when everyone fits', () => {
    expect(describeBulkFailures(f(5))).toHaveLength(5)
  })
})

describe('bulkSkipReason — invite, managed accounts', () => {
  it('invites a managed person through their manager, email or not', () => {
    expect(bulkSkipReason('invite', p({ id: '1', email: null, managed_by_person_id: 'm' }), undefined)).toBeNull()
    expect(bulkSkipReason('invite', p({ id: '2', managed_by_person_id: 'm' }), undefined)).toBeNull()
  })

  it('skips one whose manager has already confirmed', () => {
    expect(
      bulkSkipReason(
        'invite',
        p({ id: '1', managed_by_person_id: 'm', managed_accepted_at: '2026-10-01T00:00:00Z' }),
        undefined,
      ),
    ).toBe('managing member already confirmed')
  })

  it('still needs an email from someone with no manager', () => {
    expect(bulkSkipReason('invite', p({ id: '1', email: null }), undefined)).toBe('no email address')
  })
})
