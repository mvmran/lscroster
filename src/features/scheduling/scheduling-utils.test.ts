import { describe, expect, it } from 'vitest'
import { timesOverlap } from './scheduling-utils'

describe('timesOverlap', () => {
  it('flags a service with no end time that starts when a ranged one does', () => {
    expect(timesOverlap('10:00:00', null, '10:00:00', '12:00:00')).toBe(true)
    expect(timesOverlap('10:00:00', '12:00:00', '10:00:00', null)).toBe(true)
  })

  it('flags a point inside a range, but not at or after its end', () => {
    expect(timesOverlap('11:00:00', null, '10:00:00', '12:00:00')).toBe(true)
    expect(timesOverlap('12:00:00', null, '10:00:00', '12:00:00')).toBe(false)
    expect(timesOverlap('09:00:00', null, '10:00:00', '12:00:00')).toBe(false)
  })

  it('compares two points by start, and ranges as half-open', () => {
    expect(timesOverlap('10:00:00', null, '10:00:00', null)).toBe(true)
    expect(timesOverlap('09:00:00', null, '18:00:00', null)).toBe(false)
    expect(timesOverlap('09:00:00', '10:00:00', '10:00:00', '11:00:00')).toBe(false)
    expect(timesOverlap('09:00:00', '10:30:00', '10:00:00', '11:00:00')).toBe(true)
  })

  it('warns when a start time is unknown', () => {
    expect(timesOverlap(null, null, '10:00:00', null)).toBe(true)
  })
})
