import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { Mail, Search } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { FullPageError } from '@/components/full-page-error'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** How many days of email history the log and stats cover (issue #122). */
const LOG_WINDOW_DAYS = 14

function useEmailLog() {
  return useQuery({
    queryKey: ['email-log'],
    queryFn: async () => {
      const since = subDays(new Date(), LOG_WINDOW_DAYS).toISOString()
      const { data, error } = await supabase
        .from('email_log')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/**
 * Headline counts for the last 14 days (issues #118/#122). Two exact
 * head-counts keep the payload tiny regardless of volume. "Failed" is any row
 * not marked sent — a provider rejection or a not-configured send.
 */
function useEmailStats() {
  return useQuery({
    queryKey: ['email-log-stats'],
    queryFn: async () => {
      const since = subDays(new Date(), LOG_WINDOW_DAYS).toISOString()
      const [total, failed] = await Promise.all([
        supabase
          .from('email_log')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since),
        supabase
          .from('email_log')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since)
          .neq('status', 'sent'),
      ])
      if (total.error) throw new Error(total.error.message)
      if (failed.error) throw new Error(failed.error.message)
      const totalCount = total.count ?? 0
      const failedCount = failed.count ?? 0
      return { totalCount, failedCount, sentCount: totalCount - failedCount }
    },
  })
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'danger'
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-1 px-4 py-3">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'danger' && value > 0 && 'text-destructive',
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  )
}

/** Admin-only: the last 200 outbound emails, for troubleshooting delivery. */
export function EmailLogPage() {
  const { data: log, isPending, isError, error } = useEmailLog()
  const { data: stats } = useEmailStats()

  const [search, setSearch] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (log ?? []).filter((entry) => {
      if (errorsOnly && entry.status === 'sent') return false
      if (term && !entry.to_email.toLowerCase().includes(term)) return false
      return true
    })
  }, [log, search, errorsOnly])

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Email log"
        backTo="/settings"
        backLabel="Settings"
        description={`Emails sent by this instance in the last ${LOG_WINDOW_DAYS} days.`}
      />

      {/* Last-30-days summary (issue #118). */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label={`Sent · ${LOG_WINDOW_DAYS} days`}
          value={stats?.totalCount ?? 0}
        />
        <StatCard label="Delivered" value={stats?.sentCount ?? 0} />
        <StatCard label="Failed" value={stats?.failedCount ?? 0} tone="danger" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email address…"
            className="pl-9"
            aria-label="Search email log by address"
          />
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap select-none">
          <Checkbox
            checked={errorsOnly}
            onCheckedChange={(c) => setErrorsOnly(c === true)}
            aria-label="Show only errors"
          />
          Show only errors
        </label>
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : !log || log.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <Mail className="size-8" />
            No emails logged yet. Scheduling requests, nudges and reminders
            appear here once they start going out.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <Mail className="size-8" />
            No emails match these filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.created_at), 'd MMM h:mmaaa')}
                  </TableCell>
                  <TableCell className="max-w-44 truncate">{entry.to_email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.template}
                  </TableCell>
                  <TableCell>
                    {entry.status === 'sent' ? (
                      <span className="text-muted-foreground">Sent</span>
                    ) : (
                      <Badge variant="destructive" title={entry.error ?? undefined}>
                        Error
                      </Badge>
                    )}
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
