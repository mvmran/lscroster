import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeft, FileDown, Loader2, Printer } from 'lucide-react'
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
  type PlanItem,
  type TimedPlanItem,
} from '@/features/services/service-utils'
import type { PlanWithType } from '@/features/services/use-plans'
import { usePlanItems } from '@/features/services/use-plan-items'
import { usePlan } from '@/features/services/use-plans'
import { useSongs } from '@/features/services/use-songs'
import { useChurchSettings } from '@/features/settings/use-church-settings'

/** Client-side PDF of the run sheet; jsPDF is loaded only when clicked. */
function DownloadPdfButton({
  plan,
  timed,
  songKey,
  churchName,
  summary,
}: {
  plan: PlanWithType
  timed: TimedPlanItem<PlanItem>[]
  songKey: (item: PlanItem) => string | null
  churchName: string
  summary: string
}) {
  const [generating, setGenerating] = useState(false)

  async function download() {
    setGenerating(true)
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const doc = new jsPDF()

      doc.setFontSize(10)
      doc.setTextColor(120)
      doc.text(churchName, 14, 14)
      doc.setFontSize(16)
      doc.setTextColor(20)
      doc.text(`${plan.service_types.name} — ${formatPlanDate(plan.date)}`, 14, 22)
      doc.setFontSize(10)
      doc.setTextColor(120)
      if (summary) doc.text(summary, 14, 28)

      autoTable(doc, {
        startY: 33,
        head: [['Time', 'Item', 'Key', 'Length']],
        body: timed.map(({ item, startsAt, offsetSeconds }) => [
          startsAt
            ? formatClock(startsAt)
            : `+${Math.floor(offsetSeconds / 60)}:${(offsetSeconds % 60)
                .toString()
                .padStart(2, '0')}`,
          item.description ? `${item.title}\n${item.description}` : item.title,
          songKey(item) ?? '',
          item.kind === 'header' ? '' : formatLength(item.length_seconds),
        ]),
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [24, 24, 27] },
        columnStyles: {
          0: { cellWidth: 20 },
          2: { cellWidth: 16, halign: 'right' },
          3: { cellWidth: 20, halign: 'right' },
        },
        didParseCell: (data) => {
          if (
            data.section === 'body' &&
            timed[data.row.index]?.item.kind === 'header'
          ) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [240, 240, 242]
          }
        },
      })

      if (plan.notes) {
        const y =
          (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
            ?.finalY ?? 40
        doc.setFontSize(10)
        doc.setTextColor(20)
        doc.text('Notes', 14, y + 10)
        doc.setTextColor(80)
        doc.text(doc.splitTextToSize(plan.notes, 180), 14, y + 16)
      }

      doc.save(`run-sheet-${plan.date}.pdf`)
    } catch (error) {
      console.error('PDF generation failed:', error)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Button variant="outline" onClick={download} disabled={generating}>
      {generating ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileDown className="size-4" />
      )}
      PDF
    </Button>
  )
}

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
        <div className="flex gap-2">
          <DownloadPdfButton
            plan={plan}
            timed={timed}
            songKey={(item) =>
              item.kind === 'song'
                ? (item.key_override ??
                  (item.song_id ? (songById.get(item.song_id)?.default_key ?? null) : null))
                : null
            }
            churchName={settings?.name ?? ''}
            summary={[
              plan.title,
              startLabel ? `Starts ${startLabel}` : null,
              formatTotalLength(totalSeconds),
              endsAt && hasClock ? `ends ${formatClock(endsAt)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
        </div>
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
