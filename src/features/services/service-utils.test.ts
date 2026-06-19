import { describe, expect, it } from 'vitest'
import {
  findClashingPlans,
  weeklyDates,
  type ClashCandidate,
} from '@/features/services/service-utils'

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

describe('findClashingPlans (issue #78)', () => {
  const plan = (
    id: string,
    date: string,
    start: string | null,
    end: string | null,
    name = 'Sunday Service',
  ): ClashCandidate => ({
    id,
    date,
    title: null,
    service_types: { name, default_start_time: start, end_time: end },
  })

  const existing = [
    plan('a', '2026-07-05', '10:00:00', '11:30:00'),
    plan('b', '2026-07-05', '18:00:00', '19:30:00', 'Evening Service'),
    plan('c', '2026-07-12', '10:00:00', '11:30:00'),
  ]

  it('flags a service that overlaps an existing one on the same date', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '10:00:00', end: '11:30:00' },
      existing,
    )
    expect(clashes.map((c) => c.id)).toEqual(['a'])
  })

  it('flags overlap even when start and end differ', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '11:00:00', end: '12:00:00' },
      existing,
    )
    expect(clashes.map((c) => c.id)).toEqual(['a'])
  })

  it('does not flag a same-day service at a non-overlapping time', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '12:00:00', end: '13:00:00' },
      existing,
    )
    expect(clashes).toEqual([])
  })

  it('does not flag services on a different date', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-19', start: '10:00:00', end: '11:30:00' },
      existing,
    )
    expect(clashes).toEqual([])
  })

  it('excludes the plan being duplicated from the comparison', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '10:00:00', end: '11:30:00', excludeId: 'a' },
      existing,
    )
    expect(clashes).toEqual([])
  })

  it('warns when the new service has no time (cannot rule out a clash)', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: null, end: null },
      existing,
    )
    expect(clashes.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
