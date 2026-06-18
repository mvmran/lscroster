import { describe, expect, it } from 'vitest'
import { describeStreak, workloadPercentile } from './person-schedule-utils'

describe('describeStreak', () => {
  const today = '2026-06-18'

  it('reports "Not served yet" with no past dates', () => {
    expect(describeStreak([], today)).toBe('Not served yet')
  })

  it('counts a weekly run on the same weekday', () => {
    // Three consecutive Sundays
    expect(
      describeStreak(['2026-06-14', '2026-06-07', '2026-05-31'], today),
    ).toBe('3 consecutive Sundays')
  })

  it('falls back to "weeks" when the run spans different weekdays', () => {
    expect(
      describeStreak(['2026-06-14', '2026-06-08', '2026-06-01'], today),
    ).toBe('3 consecutive weeks')
  })

  it('breaks the run when a gap is more than ~a week', () => {
    // Latest service was this week, but the previous one was 3 weeks earlier,
    // so there is no streak — just recency of the latest.
    expect(describeStreak(['2026-06-14', '2026-05-24'], today)).toBe(
      'Served this week',
    )
  })

  it('reports recency for a single old service', () => {
    expect(describeStreak(['2026-05-17'], today)).toBe('Last served 4 weeks ago')
  })
})

describe('workloadPercentile', () => {
  it('returns null without enough people to compare', () => {
    expect(workloadPercentile([], 0)).toBeNull()
    expect(workloadPercentile([5], 5)).toBeNull()
  })

  it('places a mid value at the middle', () => {
    expect(workloadPercentile([1, 2, 3, 4, 5], 3)).toBe(50)
  })

  it('places the top value at 100', () => {
    expect(workloadPercentile([1, 2, 3, 4, 5], 5)).toBe(100)
  })

  it('places the bottom value at 0', () => {
    expect(workloadPercentile([1, 2, 3, 4, 5], 1)).toBe(0)
  })
})
