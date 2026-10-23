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

  it('treats a run that ended months ago as recency, not a streak', () => {
    // Four Sundays in a row, the last one 26 weeks before today.
    expect(
      describeStreak(['2025-12-21', '2025-12-14', '2025-12-07', '2025-11-30'], today),
    ).toBe('Last served 25 weeks ago')
  })

  it('still counts a run whose latest service was last week', () => {
    expect(describeStreak(['2026-06-11', '2026-06-04'], today)).toBe(
      '2 consecutive Thursdays',
    )
  })

  it('counts a weekend of Saturday and Sunday as one week', () => {
    expect(
      describeStreak(['2026-06-14', '2026-06-13', '2026-06-07', '2026-06-06'], today),
    ).toBe('2 consecutive weeks')
  })

  it('counts twice-weekly serving by the weeks it spans', () => {
    // Sundays and Wednesdays over three weeks.
    expect(
      describeStreak(['2026-06-14', '2026-06-10', '2026-06-07', '2026-06-03', '2026-05-31'], today),
    ).toBe('3 consecutive weeks')
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
