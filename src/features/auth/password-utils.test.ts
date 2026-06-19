import { describe, expect, it } from 'vitest'
import { isCommonPassword, passwordField } from './password-utils'

const ok = (v: string) => passwordField.safeParse(v).success

describe('passwordField (issue #60)', () => {
  it('accepts a strong password', () => {
    expect(ok('Sunday42roster')).toBe(true)
  })

  it('rejects shorter than 8 characters', () => {
    expect(ok('Ab1cdef')).toBe(false)
  })

  it('requires both upper- and lower-case letters', () => {
    expect(ok('alllowercase')).toBe(false)
    expect(ok('ALLUPPERCASE')).toBe(false)
    expect(ok('MixedCasePass')).toBe(true)
  })

  it('rejects common passwords case-insensitively', () => {
    expect(ok('Password1')).toBe(false)
    expect(ok('password123')).toBe(false)
  })
})

describe('isCommonPassword', () => {
  it('matches regardless of case and surrounding space', () => {
    expect(isCommonPassword('PASSWORD')).toBe(true)
    expect(isCommonPassword('  welcome1 ')).toBe(true)
    expect(isCommonPassword('a-genuinely-unusual-phrase')).toBe(false)
  })
})
