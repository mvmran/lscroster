import { useState } from 'react'
import { format } from 'date-fns'
import { MonitorPlay } from 'lucide-react'
import { FullPageError } from '@/components/full-page-error'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PROJECTION_LOG_DAYS,
  PROJECTION_LOG_LIMIT,
  reasonLabel,
  useProjectionLog,
  useProjectionLogStats,
  type ProjectionLogEntry,
} from '@/features/settings/use-projection-log'
import { cn } from '@/lib/utils'

/** Which key a request used, as far as anyone can tell. */
function keyLabel(entry: ProjectionLogEntry): string {
  const key = entry.projection_api_keys
  if (key) return key.revoked_at ? `${key.label} (revoked)` : key.label
  if (entry.key_prefix) return `${entry.key_prefix}… (unknown key)`
  return 'No key'
}

function LogRow({ entry }: { entry: ProjectionLogEntry }) {
  const failed = entry.http_status >= 400
  const details = [entry.ip, entry.user_agent].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-0.5 border-b px-4 py-3 text-sm last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground tabular-nums">
          {format(new Date(entry.requested_at), 'd MMM h:mm:ssaaa')}
        </span>
        <Badge
          variant={failed ? 'destructive' : 'outline'}
          title={`HTTP ${entry.http_status}`}
        >
          {reasonLabel(entry)}
        </Badge>
        <span className="text-muted-foreground text-xs tabular-nums">
          {entry.http_status}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <span className="font-medium">{keyLabel(entry)}</span>
        <code className="text-muted-foreground min-w-0 text-xs break-all">
          {entry.method && entry.method !== 'GET' ? `${entry.method} ` : ''}
          {entry.path ?? entry.endpoint}
        </code>
      </div>
      {details && (
        <p className="text-muted-foreground text-xs break-all">{details}</p>
      )}
      {entry.detail && <p className="text-destructive text-xs">{entry.detail}</p>}
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number | undefined
  tone?: 'danger'
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-1 px-4 py-3">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'danger' && (value ?? 0) > 0 && 'text-destructive',
          )}
        >
          {value ?? '–'}
        </span>
      </CardContent>
    </Card>
  )
}

/**
 * Admin-only: what the projection software — and anything else — has asked the
 * projection API, and why a request was refused (0072). Failures first, since
 * that is what someone comes here to find: a device still on a revoked key, a
 * mistyped key, a plan asked for before it was published.
 */
export function ProjectionLogPage() {
  const [failuresOnly, setFailuresOnly] = useState(true)
  const { data, isPending, isError, error } = useProjectionLog(failuresOnly)
  const { data: stats, isError: statsFailed } = useProjectionLogStats()

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Projection API log"
        backTo="/settings"
        backLabel="Settings"
        description={`Requests to the projection API in the last ${PROJECTION_LOG_DAYS} days. Failures are kept 90 days, other requests a year.`}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label={`Requests · ${PROJECTION_LOG_DAYS} days`} value={stats?.total} />
        <StatCard label="Failed" value={stats?.failed} tone="danger" />
      </div>
      {statsFailed && (
        <p className="text-destructive -mt-2 text-xs">
          Couldn’t count the requests — the list below is still up to date.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id="projection-log-failures"
          checked={failuresOnly}
          onCheckedChange={(c) => setFailuresOnly(c === true)}
        />
        <label htmlFor="projection-log-failures" className="text-sm select-none">
          Show only failures
        </label>
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : data.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <MonitorPlay className="size-8" />
            {failuresOnly
              ? `No failed requests in the last ${PROJECTION_LOG_DAYS} days.`
              : `No requests in the last ${PROJECTION_LOG_DAYS} days.`}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="gap-0 py-0">
            {data.rows.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </Card>
          {data.overflow && (
            <p className="text-muted-foreground text-center text-xs">
              Showing the newest {PROJECTION_LOG_LIMIT}.
            </p>
          )}
        </>
      )}
    </div>
  )
}
