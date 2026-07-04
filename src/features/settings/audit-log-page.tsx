import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { FullPageError } from '@/components/full-page-error'
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ROW_LIMIT,
  useAuditLog,
  type AuditFilters,
} from '@/features/settings/use-audit-log'

/** Format a Date as a `datetime-local` value in the browser's timezone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

function defaultFilters(): AuditFilters {
  const to = new Date()
  const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000)
  return {
    from: toLocalInput(from),
    to: toLocalInput(to),
    action: 'all',
    target: '',
    actor: '',
  }
}

/**
 * Admin-only audit trail (issue #116). Records of who changed what, newest
 * first, filtered by date range (default 3 days), event type, the affected
 * person, and the user who made the change. Capped at 200 rows.
 */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>(defaultFilters)

  // The query takes ISO bounds; the inputs hold local datetime strings.
  const queryFilters = useMemo<AuditFilters>(
    () => ({
      ...filters,
      from: new Date(filters.from).toISOString(),
      to: new Date(filters.to).toISOString(),
    }),
    [filters],
  )

  const { data, isPending, isError, error } = useAuditLog(queryFilters)

  function set<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit log"
        backTo="/settings"
        backLabel="Settings"
        description="Who changed what, newest first. Covers people and team changes."
      />

      <Card className="py-0">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-from">From</Label>
            <Input
              id="audit-from"
              type="datetime-local"
              value={filters.from}
              max={filters.to}
              onChange={(e) => set('from', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-to">To</Label>
            <Input
              id="audit-to"
              type="datetime-local"
              value={filters.to}
              min={filters.from}
              onChange={(e) => set('to', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-action">Event</Label>
            <Select value={filters.action} onValueChange={(v) => set('action', v)}>
              <SelectTrigger id="audit-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {AUDIT_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIT_ACTION_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-target">Person</Label>
            <Input
              id="audit-target"
              value={filters.target}
              onChange={(e) => set('target', e.target.value)}
              placeholder="Affected person’s name…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-actor">Changed by</Label>
            <Input
              id="audit-actor"
              value={filters.actor}
              onChange={(e) => set('actor', e.target.value)}
              placeholder="User who made the change…"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setFilters(defaultFilters())}
            >
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {data?.overflow && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
          Showing the most recent {AUDIT_ROW_LIMIT} of more than {AUDIT_ROW_LIMIT}{' '}
          events. Narrow the date range to see them all.
        </div>
      )}

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <ScrollText className="size-8" />
            No events match these filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Changed by</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.created_at), 'd MMM yyyy h:mmaaa')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="whitespace-nowrap">
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {entry.target_label ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {entry.actor_label ?? 'System'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.summary}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
