import { describe, expect, it } from 'vitest'
import { weeklyDates } from '@/features/services/service-utils'

describe('weeklyDates (issue #72)', () => {
  it('returns just the start date when no end is given equal to start', () => {
    expect(weeklyDates('2026-07-05', '2026-07-05')).toEqual(['2026-07-05'])
  })

  it('includes the start and every 7-day step up to and including the end', () => {
    expect(weeklyDates('2026-07-05', '2026-07-26')).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
    ])
  })

  it('stops before overshooting when the end is not on a weekly boundary', () => {
    expect(weeklyDates('2026-07-05', '2026-07-20')).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
    ])
  })

  it('falls back to a single date when the end is before the start', () => {
    expect(weeklyDates('2026-07-12', '2026-07-05')).toEqual(['2026-07-12'])
  })

  it('crosses month/year boundaries correctly', () => {
    expect(weeklyDates('2026-12-27', '2027-01-10')).toEqual([
      '2026-12-27',
      '2027-01-03',
      '2027-01-10',
    ])
  })

  it('respects the cap to avoid runaway loops', () => {
    expect(weeklyDates('2026-01-01', '2030-01-01', 3)).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
    ])
  })
})
