import { describe, expect, it } from 'vitest'
import { bulkConfirmQuestion, bulkSkipReason, partitionBulk } from './bulk-utils'

type P = { id: string; email: string | null; auth_user_id: string | null; status: 'active' | 'inactive' }
const p = (over: Partial<P> & { id: string }): P => ({
  email: 'a@b.com',
  auth_user_id: null,
  status: 'active',
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
