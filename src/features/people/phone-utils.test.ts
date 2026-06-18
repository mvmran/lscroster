import { describe, expect, it } from 'vitest'
import { formatPhone, isValidPhone } from './phone-utils'

describe('formatPhone', () => {
  it('formats an Australian mobile as 04nn nnn nnn', () => {
    expect(formatPhone('0412345678')).toBe('0412 345 678')
  })

  it('re-formats a mobile that already has spaces/punctuation', () => {
    expect(formatPhone('(0412) 345-678')).toBe('0412 345 678')
  })

  it('keeps the country code and groups the national part in 3s', () => {
    expect(formatPhone('+61412345678')).toBe('+61 412 345 678')
  })

  it('merges a lone trailing digit into the previous group', () => {
    // 7 national digits -> 3 + 4 rather than 3 + 3 + 1
    expect(formatPhone('+61 1234567')).toBe('+61 123 4567')
  })

  it('treats single-digit country codes (+1) correctly', () => {
    expect(formatPhone('+12025550173')).toBe('+1 202 555 0173')
  })

  it('returns empty for nullish input', () => {
    expect(formatPhone(undefined)).toBe('')
    expect(formatPhone(null)).toBe('')
    expect(formatPhone('')).toBe('')
  })

  it('leaves an unrecognised number untouched', () => {
    expect(formatPhone('1300 GO ROSTER')).toBe('1300 GO ROSTER')
  })
})

describe('isValidPhone', () => {
  it('accepts empty (optional field)', () => {
    expect(isValidPhone('')).toBe(true)
    expect(isValidPhone(null)).toBe(true)
  })

  it('accepts a valid AU mobile in any spacing', () => {
    expect(isValidPhone('0412345678')).toBe(true)
    expect(isValidPhone('0412 345 678')).toBe(true)
  })

  it('rejects a non-mobile AU number', () => {
    expect(isValidPhone('0298765432')).toBe(false) // landline
    expect(isValidPhone('041234567')).toBe(false) // too short
  })

  it('accepts a plausible international number', () => {
    expect(isValidPhone('+61412345678')).toBe(true)
    expect(isValidPhone('+1 202 555 0173')).toBe(true)
  })

  it('rejects a too-short or too-long international number', () => {
    expect(isValidPhone('+123')).toBe(false)
    expect(isValidPhone('+1234567890123456')).toBe(false)
  })
})
