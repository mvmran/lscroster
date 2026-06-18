import { differenceInCalendarDays, format, parseISO } from 'date-fns'

// Pure helpers for the Activity summary on the profile Schedules card (#56).

/**
 * A short streak/recency label from a person's past service dates (most-recent
 * first, deduped to one per day, all in the past). Counts the run of services
 * spaced about a week apart ending at the latest one; when that run shares a
 * weekday it reads "3 consecutive Sundays", otherwise "3 consecutive weeks".
 * A run shorter than two falls back to "Last served N weeks ago".
 */
export function describeStreak(pastDatesDesc: string[], todayISO: string): string {
  if (pastDatesDesc.length === 0) return 'Not served yet'
  const today = parseISO(todayISO)
  const last = parseISO(pastDatesDesc[0])

  let streak = 1
  for (let i = 1; i < pastDatesDesc.length; i++) {
    const gap = differenceInCalendarDays(
      parseISO(pastDatesDesc[i - 1]),
      parseISO(pastDatesDesc[i]),
    )
    if (gap >= 6 && gap <= 8) streak++
    else break
  }

  if (streak >= 2) {
    const weekdays = new Set(
      pastDatesDesc.slice(0, streak).map((d) => parseISO(d).getDay()),
    )
    const unit = weekdays.size === 1 ? `${format(last, 'EEEE')}s` : 'weeks'
    return `${streak} consecutive ${unit}`
  }

  const weeksAgo = Math.floor(differenceInCalendarDays(today, last) / 7)
  if (weeksAgo <= 0) return 'Served this week'
  if (weeksAgo === 1) return 'Last served 1 week ago'
  return `Last served ${weeksAgo} weeks ago`
}

/**
 * Where one person sits in the spread of serving load: the percentage of the
 * team they serve at least as often as. Returns null when there aren't enough
 * people to compare against (e.g. a member who can only see their own data).
 * `allCounts` is every person's service count, `myCount` this person's.
 */
export function workloadPercentile(
  allCounts: number[],
  myCount: number,
): number | null {
  if (allCounts.length < 2) return null
  const fewer = allCounts.filter((c) => c < myCount).length
  return Math.round((100 * fewer) / (allCounts.length - 1))
}
