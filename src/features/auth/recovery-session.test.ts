import { describe, expect, it } from 'vitest'
import { isRecentRecovery, RECOVERY_WINDOW_SECONDS } from './recovery-session'

const NOW = 1_800_000_000

/** An unsigned JWT with the given payload — only the payload is read. */
function token(payload: unknown): string {
  const base64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${base64url}.signature`
}

describe('isRecentRecovery', () => {
  it('accepts a session opened by a reset link just now', () => {
    expect(isRecentRecovery(token({ amr: [{ method: 'otp', timestamp: NOW - 60 }] }), NOW)).toBe(
      true,
    )
  })

  it('refuses an ordinary password sign-in', () => {
    expect(
      isRecentRecovery(token({ amr: [{ method: 'password', timestamp: NOW - 60 }] }), NOW),
    ).toBe(false)
  })

  it('refuses a reset link followed more than an hour ago', () => {
    const old = NOW - RECOVERY_WINDOW_SECONDS - 1
    expect(isRecentRecovery(token({ amr: [{ method: 'otp', timestamp: old }] }), NOW)).toBe(false)
  })

  it('refuses the timeless string form of amr, but still reads object entries beside it', () => {
    expect(isRecentRecovery(token({ amr: ['otp'] }), NOW)).toBe(false)
    expect(
      isRecentRecovery(token({ amr: ['mfa', { method: 'otp', timestamp: NOW - 60 }] }), NOW),
    ).toBe(true)
  })

  it('refuses no session, a token without amr, and a token that is not a JWT', () => {
    expect(isRecentRecovery(null, NOW)).toBe(false)
    expect(isRecentRecovery(token({ sub: 'someone' }), NOW)).toBe(false)
    expect(isRecentRecovery('not-a-jwt', NOW)).toBe(false)
    expect(isRecentRecovery('a.%%%.b', NOW)).toBe(false)
  })
})
