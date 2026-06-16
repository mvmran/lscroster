import { useMemo, useState } from 'react'
import { format, subMonths } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatPlanDateShort, todayISODate } from '@/features/services/service-utils'
import { usePersonSchedule } from '@/features/scheduling/use-assignments'

/** How far back the Past list reaches (issue #52). */
type PastPeriod = 'last1m' | 'last3m' | 'recent6'

const PAST_PERIOD_LABELS: Record<PastPeriod, string> = {
  last1m: 'Last 1 month',
  last3m: 'Last 3 months',
  recent6: 'Most recent 6',
}

function DateList({ dates, empty }: { dates: string[]; empty: string }) {
  if (dates.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {dates.map((date) => (
        <li key={date} className="tabular-nums">
          {formatPlanDateShort(date)}
        </li>
      ))}
    </ul>
  )
}

/**
 * Past and upcoming services a person is scheduled onto (issue #52). The period
 * dropdown trims the Past list; Upcoming always shows everything. One date per
 * service even if the person fills several positions that day.
 */
export function PersonScheduleCard({ personId }: { personId: string }) {
  const { data, isPending, isError, error } = usePersonSchedule(personId)
  const [period, setPeriod] = useState<PastPeriod>('last1m')

  const { past, upcoming } = useMemo(() => {
    const today = todayISODate()
    // One row per service date (a person can hold multiple positions on a plan).
    const dates = [
      ...new Set((data ?? []).filter((r) => r.plans).map((r) => r.plans!.date)),
    ]
    const upcoming = dates.filter((d) => d >= today).sort() // ascending
    let past = dates.filter((d) => d < today).sort().reverse() // most recent first

    if (period === 'recent6') {
      past = past.slice(0, 6)
    } else {
      const cutoff = format(subMonths(new Date(), period === 'last1m' ? 1 : 3), 'yyyy-MM-dd')
      past = past.filter((d) => d >= cutoff)
    }
    return { past, upcoming }
  }, [data, period])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Schedules</CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as PastPeriod)}>
            <SelectTrigger className="h-8 w-auto gap-1 text-xs" aria-label="Past schedules period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAST_PERIOD_LABELS) as PastPeriod[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {PAST_PERIOD_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : isError ? (
          <p className="text-destructive text-sm">{error.message}</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">Past</h3>
              <DateList dates={past} empty="No services in this period." />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">Upcoming</h3>
              <DateList dates={upcoming} empty="Nothing scheduled." />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
