import { useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { FullPageError } from '@/components/full-page-error'
import { FullPageLoader } from '@/components/full-page-loader'
import { Button } from '@/components/ui/button'
import {
  computeItemTimes,
  formatClock,
  formatLength,
  formatPlanDate,
  formatTotalLength,
} from '@/features/services/service-utils'
import { usePlanItems } from '@/features/services/use-plan-items'
import { usePlan } from '@/features/services/use-plans'
import { useSongs } from '@/features/services/use-songs'
import { useChurchSettings } from '@/features/settings/use-church-settings'

/**
 * Clean run sheet for printing. Rendered outside the app shell; the on-screen
 * toolbar is hidden by the print stylesheet (Tailwind `print:` variants).
 */
export function PlanPrintPage() {
  const { id } = useParams<{ id: string }>()

  // Run sheets are paper-bound: render light regardless of the app theme.
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    root.classList.remove('dark')
    return () => {
      if (hadDark) root.classList.add('dark')
    }
  }, [])

  const planQuery = usePlan(id)
  const itemsQuery = usePlanItems(id)
  const { data: songs } = useSongs()
  const { data: settings } = useChurchSettings()

  const plan = planQuery.data
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const songById = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs])

  const { timed, totalSeconds, endsAt } = useMemo(
    () =>
      computeItemTimes(
        items,
        plan?.date ?? '2000-01-01',
        plan?.service_types.default_start_time ?? null,
      ),
    [items, plan],
  )

  if (planQuery.isError) return <FullPageError message={planQuery.error.message} />
  if (planQuery.isPending || itemsQuery.isPending) return <FullPageLoader />
  if (!plan) return <FullPageError message="This plan doesn't exist." />

  const hasClock = !!plan.service_types.default_start_time
  const startLabel =
    hasClock && timed[0]?.startsAt ? formatClock(timed[0].startsAt) : null

  return (
    <div className="mx-auto max-w-3xl p-6 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/services/plans/${plan.id}`}>
            <ArrowLeft className="size-4" />
            Back to plan
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      <header className="mb-4 border-b pb-3">
        <p className="text-muted-foreground text-sm print:text-xs">
          {settings?.name}
        </p>
        <h1 className="text-2xl font-semibold print:text-xl">
          {plan.service_types.name} — {formatPlanDate(plan.date)}
        </h1>
        <p className="text-muted-foreground text-sm print:text-xs">
          {[
            plan.title,
            startLabel ? `Starts ${startLabel}` : null,
            formatTotalLength(totalSeconds),
            endsAt && hasClock ? `ends ${formatClock(endsAt)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          The order of service is empty.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs uppercase">
              <th className="w-16 py-1.5 pr-2 font-medium">Time</th>
              <th className="py-1.5 pr-2 font-medium">Item</th>
              <th className="w-12 py-1.5 pr-2 text-right font-medium">Key</th>
              <th className="w-14 py-1.5 text-right font-medium">Length</th>
            </tr>
          </thead>
          <tbody>
            {timed.map(({ item, startsAt, offsetSeconds }) => {
              const isHeader = item.kind === 'header'
              const key =
                item.kind === 'song'
                  ? (item.key_override ??
                    (item.song_id ? songById.get(item.song_id)?.default_key : null))
                  : null
              return (
                <tr
                  key={item.id}
                  className={isHeader ? 'bg-muted/50 border-b' : 'border-b'}
                >
                  <td className="py-1.5 pr-2 align-top tabular-nums">
                    {startsAt
                      ? formatClock(startsAt)
                      : `+${Math.floor(offsetSeconds / 60)}:${(offsetSeconds % 60)
                          .toString()
                          .padStart(2, '0')}`}
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <span
                      className={
                        isHeader
                          ? 'text-xs font-semibold tracking-wide uppercase'
                          : 'font-medium'
                      }
                    >
                      {item.title}
                    </span>
                    {item.description && (
                      <p className="text-muted-foreground text-xs">{item.description}</p>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right align-top tabular-nums">
                    {key ?? ''}
                  </td>
                  <td className="py-1.5 text-right align-top tabular-nums">
                    {isHeader ? '' : formatLength(item.length_seconds)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {plan.notes && (
        <section className="mt-4">
          <h2 className="text-xs font-semibold tracking-wide uppercase">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{plan.notes}</p>
        </section>
      )}

      <footer className="text-muted-foreground mt-6 text-xs">
        Printed {format(new Date(), "d MMM yyyy 'at' h:mmaaa")}
      </footer>
    </div>
  )
}
