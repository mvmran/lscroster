import { useMemo, useState } from 'react'
import { format, parseISO, subMonths } from 'date-fns'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  describeStreak,
  workloadPercentile,
} from '@/features/people/person-schedule-utils'
import { formatPlanDateShort, todayISODate } from '@/features/services/service-utils'
import {
  usePersonSchedule,
  useRosterWorkload,
} from '@/features/scheduling/use-assignments'
import { usePersonBlockouts } from '@/features/scheduling/use-blockouts'
import {
  serviceTypeTeamSort,
  useAllPositions,
  useTeams,
  type TeamWithCounts,
} from '@/features/scheduling/use-teams'

/** How far back the Past list reaches (issue #52). */
type PastPeriod = 'last1m' | 'last3m' | 'recent6'

const PAST_PERIOD_LABELS: Record<PastPeriod, string> = {
  last1m: 'Last 1 month',
  last3m: 'Last 3 months',
  recent6: 'Last 6 services',
}

interface PositionInfo {
  name: string
  teamId: string
  sortOrder: number
}

/** One service instance a person is on, with the positions they fill that day. */
interface ScheduleItem {
  planId: string
  date: string
  serviceTypeId: string
  serviceType: string
  positionIds: string[]
  /** Position names sorted in service-type order (issue #56). */
  positions: string[]
}

/** Upcoming-assignment status tallies that drive the red/yellow/green bar. */
interface StatusCounts {
  pending: number
  unconfirmed: number
  confirmed: number
}

function pluralAssignments(n: number) {
  return n === 1 ? 'assignment' : 'assignments'
}

/**
 * Order a service's positions the way the plan/matrix does (issue #56): by the
 * team's per-service-type order, then the position's own sort order. Names are
 * de-duplicated in case a position appears twice.
 */
function sortPositionNames(
  positionIds: string[],
  serviceTypeId: string,
  positionById: Map<string, PositionInfo>,
  teamById: Map<string, TeamWithCounts>,
): string[] {
  const infos = positionIds
    .map((id) => positionById.get(id))
    .filter((p): p is PositionInfo => !!p)
    .sort((a, b) => {
      const ta = teamById.get(a.teamId)
      const tb = teamById.get(b.teamId)
      const sa = ta ? serviceTypeTeamSort(ta, serviceTypeId) : Number.MAX_SAFE_INTEGER
      const sb = tb ? serviceTypeTeamSort(tb, serviceTypeId) : Number.MAX_SAFE_INTEGER
      return sa - sb || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    })
  const names: string[] = []
  for (const info of infos) {
    if (!names.includes(info.name)) names.push(info.name)
  }
  return names
}

function StatusBar({ pending, unconfirmed, confirmed }: StatusCounts) {
  const total = pending + unconfirmed + confirmed
  if (total === 0) return null

  const segments = [
    { key: 'pending', count: pending, color: 'bg-red-500', label: `${pending} pending ${pluralAssignments(pending)}` },
    { key: 'unconfirmed', count: unconfirmed, color: 'bg-yellow-500', label: `${unconfirmed} unconfirmed ${pluralAssignments(unconfirmed)}` },
    { key: 'confirmed', count: confirmed, color: 'bg-green-500', label: `${confirmed} confirmed ${pluralAssignments(confirmed)}` },
  ].filter((s) => s.count > 0)

  return (
    <div className="flex flex-col gap-1">
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
      <p className="text-muted-foreground text-center text-xs italic">
        upcoming assignments status
      </p>
    </div>
  )
}

function ScheduleList({ items, empty }: { items: ScheduleItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {items.map((item) => (
        <li key={item.planId}>
          <Link
            to={`/services/plans/${item.planId}`}
            className="hover:bg-accent -mx-2 block rounded-md px-2 py-1 transition-colors"
          >
            <span className="tabular-nums">{formatPlanDateShort(item.date)}</span>
            {item.serviceType && ` — ${item.serviceType}`}
            {item.positions.length > 0 && (
              <span className="text-muted-foreground text-xs font-normal italic">
                {' '}
                ({item.positions.join(', ')})
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function formatBlockoutRange(start: string, end: string): string {
  const s = format(parseISO(start), 'd MMM yyyy')
  if (start === end) return s
  return `${s} – ${format(parseISO(end), 'd MMM yyyy')}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 flex flex-col gap-0.5 rounded-md p-2.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="font-heading text-base leading-snug font-medium italic">
      {children}
    </h3>
  )
}

/**
 * Past and upcoming services a person is scheduled onto, plus their blockouts
 * and an activity summary (issues #52, #55, #56). The period dropdown trims the
 * Past list; Upcoming always shows everything. One row per service even if the
 * person fills several positions that day. `canSeeTeam` is true for admins and
 * leaders, who alone can read the whole roster needed for the team percentile.
 */
export function PersonScheduleCard({
  personId,
  canSeeTeam,
}: {
  personId: string
  canSeeTeam: boolean
}) {
  const { data, isPending, isError, error } = usePersonSchedule(personId)
  const { data: teams } = useTeams()
  const { data: positions } = useAllPositions()
  const blockouts = usePersonBlockouts(personId)
  const workload = useRosterWorkload(canSeeTeam)
  const [period, setPeriod] = useState<PastPeriod>('last1m')

  const positionById = useMemo(() => {
    const map = new Map<string, PositionInfo>()
    for (const p of positions ?? []) {
      map.set(p.id, { name: p.name, teamId: p.team_id, sortOrder: p.sort_order })
    }
    return map
  }, [positions])

  const teamById = useMemo(() => {
    const map = new Map<string, TeamWithCounts>()
    for (const t of teams ?? []) map.set(t.id, t)
    return map
  }, [teams])

  const { items, counts, favPositions, monthCount, yearCount, streakLabel } =
    useMemo(() => {
      const today = todayISODate()
      const counts: StatusCounts = { pending: 0, unconfirmed: 0, confirmed: 0 }
      const posTally = new Map<string, number>()
      const byPlan = new Map<string, ScheduleItem>()

      for (const r of data ?? []) {
        if (!r.plans) continue
        if (r.plans.date >= today) {
          if (r.status === 'confirmed') counts.confirmed += 1
          else if (r.status === 'pending') {
            if (r.notified_at) counts.unconfirmed += 1
            else counts.pending += 1
          }
        }
        posTally.set(r.position_id, (posTally.get(r.position_id) ?? 0) + 1)
        let item = byPlan.get(r.plans.id)
        if (!item) {
          item = {
            planId: r.plans.id,
            date: r.plans.date,
            serviceTypeId: r.plans.service_type_id,
            serviceType: r.plans.service_types?.name ?? '',
            positionIds: [],
            positions: [],
          }
          byPlan.set(r.plans.id, item)
        }
        item.positionIds.push(r.position_id)
      }

      const items = [...byPlan.values()].map((it) => ({
        ...it,
        positions: sortPositionNames(
          it.positionIds,
          it.serviceTypeId,
          positionById,
          teamById,
        ),
      }))

      const ym = today.slice(0, 7)
      const yyyy = today.slice(0, 4)
      let monthCount = 0
      let yearCount = 0
      for (const it of items) {
        if (it.date.startsWith(yyyy)) yearCount += 1
        if (it.date.startsWith(ym)) monthCount += 1
      }

      const favPositions = [...posTally.entries()]
        .map(([id, n]) => ({ name: positionById.get(id)?.name ?? '', n }))
        .filter((p) => p.name)
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
        .slice(0, 2)
        .map((p) => p.name)

      const pastDatesDesc = [
        ...new Set(items.filter((i) => i.date < today).map((i) => i.date)),
      ]
        .sort()
        .reverse()
      const streakLabel = describeStreak(pastDatesDesc, today)

      return { items, counts, favPositions, monthCount, yearCount, streakLabel }
    }, [data, positionById, teamById])

  const { past, upcoming } = useMemo(() => {
    const today = todayISODate()
    const upcoming = items
      .filter((i) => i.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    let past = items
      .filter((i) => i.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))
    if (period === 'recent6') {
      past = past.slice(0, 6)
    } else {
      const cutoff = format(subMonths(new Date(), period === 'last1m' ? 1 : 3), 'yyyy-MM-dd')
      past = past.filter((i) => i.date >= cutoff)
    }
    return { past, upcoming }
  }, [items, period])

  const percentile = useMemo(() => {
    if (!canSeeTeam || !workload.data) return null
    const byPerson = new Map<string, Set<string>>()
    for (const row of workload.data) {
      if (!row.plans) continue
      const set = byPerson.get(row.person_id) ?? new Set<string>()
      set.add(row.plans.date)
      byPerson.set(row.person_id, set)
    }
    if (!byPerson.has(personId)) byPerson.set(personId, new Set())
    const allCounts = [...byPerson.values()].map((s) => s.size)
    const myCount = byPerson.get(personId)?.size ?? 0
    const pct = workloadPercentile(allCounts, myCount)
    return pct == null ? null : { pct }
  }, [canSeeTeam, workload.data, personId])

  const upcomingBlockouts = useMemo(() => {
    const today = todayISODate()
    return (blockouts.data ?? []).filter((b) => b.end_date >= today)
  }, [blockouts.data])

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
              <SectionHeading>Past</SectionHeading>
              <ScheduleList items={past} empty="No services in this period." />
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeading>Upcoming</SectionHeading>
              <ScheduleList items={upcoming} empty="Nothing scheduled." />
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeading>Block out dates</SectionHeading>
              {upcomingBlockouts.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No upcoming block out dates.
                </p>
              ) : (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {upcomingBlockouts.map((b) => (
                    <li key={b.id}>
                      {formatBlockoutRange(b.start_date, b.end_date)}
                      {b.reason && (
                        <span className="text-muted-foreground/80 text-xs italic">
                          {' '}
                          ({b.reason})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeading>Activity summary</SectionHeading>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="This month" value={String(monthCount)} />
                <Stat label="This year" value={String(yearCount)} />
                <Stat
                  label="Top positions"
                  value={favPositions.length > 0 ? favPositions.join(', ') : '—'}
                />
                <Stat label="Streak" value={streakLabel} />
              </div>
              {percentile && (
                <div className="mt-1 flex flex-col gap-1">
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>Serving load vs the team</span>
                    <span className="tabular-nums">
                      {percentile.pct >= 60
                        ? 'More than most'
                        : percentile.pct <= 40
                          ? 'Less than most'
                          : 'About average'}
                    </span>
                  </div>
                  <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${percentile.pct}%` }}
                    />
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
