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
  recent6: 'Last 6 services',
}

/** One service instance a person is on: its date plus the service type name. */
interface ScheduleItem {
  planId: string
  date: string
  serviceType: string
}

/** Upcoming-assignment status tallies that drive the red/yellow/green bar. */
interface StatusCounts {
  /** Red — pending and not yet emailed. */
  pending: number
  /** Yellow — emailed but not yet confirmed. */
  unconfirmed: number
  /** Green — confirmed. */
  confirmed: number
}

function pluralAssignments(n: number) {
  return n === 1 ? 'assignment' : 'assignments'
}

/**
 * Stacked horizontal bar of a member's upcoming assignment statuses (published
 * and unpublished): red = yet to be emailed, yellow = emailed but unconfirmed,
 * green = confirmed. Each segment is widthed by its share of the total and
 * carries a hover title like "2 confirmed assignments".
 */
function StatusBar({ pending, unconfirmed, confirmed }: StatusCounts) {
  const total = pending + unconfirmed + confirmed
  if (total === 0) return null

  const segments = [
    { key: 'pending', count: pending, color: 'bg-red-500', label: `${pending} pending ${pluralAssignments(pending)}` },
    { key: 'unconfirmed', count: unconfirmed, color: 'bg-yellow-500', label: `${unconfirmed} unconfirmed ${pluralAssignments(unconfirmed)}` },
    { key: 'confirmed', count: confirmed, color: 'bg-green-500', label: `${confirmed} confirmed ${pluralAssignments(confirmed)}` },
  ].filter((s) => s.count > 0)

  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`Upcoming assignments: ${segments.map((s) => s.label).join(', ')}`}
    >
      {segments.map((s) => (
        <div
          key={s.key}
          className={s.color}
          style={{ width: `${(s.count / total) * 100}%` }}
          title={s.label}
        />
      ))}
    </div>
  )
}

function ScheduleList({ items, empty }: { items: ScheduleItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((item) => (
        <li key={item.planId} className="tabular-nums">
          {formatPlanDateShort(item.date)}
          {item.serviceType && ` — ${item.serviceType}`}
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

  const { past, upcoming, counts } = useMemo(() => {
    const today = todayISODate()
    // Status tallies count individual assignments (not deduped) across every
    // upcoming service, published or not. Declined rows are excluded upstream.
    const counts: StatusCounts = { pending: 0, unconfirmed: 0, confirmed: 0 }
    for (const r of data ?? []) {
      if (!r.plans || r.plans.date < today) continue
      if (r.status === 'confirmed') counts.confirmed += 1
      else if (r.status === 'pending') {
        if (r.notified_at) counts.unconfirmed += 1
        else counts.pending += 1
      }
    }
    // One row per service (a person can hold multiple positions on a plan), so
    // dedupe by plan — two different services on the same day stay separate.
    const byPlan = new Map<string, ScheduleItem>()
    for (const r of data ?? []) {
      if (r.plans && !byPlan.has(r.plans.id)) {
        byPlan.set(r.plans.id, {
          planId: r.plans.id,
          date: r.plans.date,
          serviceType: r.plans.service_types?.name ?? '',
        })
      }
    }
    const items = [...byPlan.values()]
    const upcoming = items
      .filter((i) => i.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)) // ascending
    let past = items
      .filter((i) => i.date < today)
      .sort((a, b) => b.date.localeCompare(a.date)) // most recent first

    if (period === 'recent6') {
      past = past.slice(0, 6)
    } else {
      const cutoff = format(subMonths(new Date(), period === 'last1m' ? 1 : 3), 'yyyy-MM-dd')
      past = past.filter((i) => i.date >= cutoff)
    }
    return { past, upcoming, counts }
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
            <StatusBar {...counts} />
            <section className="flex flex-col gap-2">
              <h3 className="font-heading text-base leading-snug font-medium">Past</h3>
              <ScheduleList items={past} empty="No services in this period." />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-heading text-base leading-snug font-medium">Upcoming</h3>
              <ScheduleList items={upcoming} empty="Nothing scheduled." />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
