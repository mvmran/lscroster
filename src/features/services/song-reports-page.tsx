import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subMonths } from 'date-fns'
import { Music } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'
import { FullPageError } from '@/components/full-page-error'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
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
import { formatPlanDateShort, todayISODate } from '@/features/services/service-utils'
import { useSongs } from '@/features/services/use-songs'
import { supabase } from '@/lib/supabase'

interface UsageRow {
  song_id: string | null
  plans: {
    date: string
    service_type_id: string
    service_types: { name: string } | null
  }
}

function useSongUsageRows() {
  return useQuery({
    queryKey: ['song-usage-rows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_items')
        .select('song_id, plans!inner(date, service_type_id, service_types(name))')
        .not('song_id', 'is', null)
        .limit(5000)
      if (error) throw new Error(error.message)
      return data as UsageRow[]
    },
    staleTime: 60 * 1000,
  })
}

/** Song usage report: frequency, last played, and uses by service type. */
export function SongReportsPage() {
  const { data: songs, isPending: songsPending } = useSongs()
  const { data: rows, isPending, isError, error } = useSongUsageRows()
  const navigate = useNavigate()
  const [window_, setWindow] = useState('12')

  const today = todayISODate()
  const since =
    window_ === 'all'
      ? '0000-01-01'
      : format(subMonths(new Date(), parseInt(window_, 10)), 'yyyy-MM-dd')

  const { report, typeNames } = useMemo(() => {
    const typeNames = new Map<string, string>()
    const bySong = new Map<
      string,
      { total: number; lastPlayed: string | null; byType: Map<string, number> }
    >()
    for (const row of rows ?? []) {
      if (!row.song_id) continue
      const date = row.plans.date
      if (date < since || date > today) continue
      typeNames.set(
        row.plans.service_type_id,
        row.plans.service_types?.name ?? '?',
      )
      const entry =
        bySong.get(row.song_id) ??
        { total: 0, lastPlayed: null as string | null, byType: new Map<string, number>() }
      entry.total += 1
      if (!entry.lastPlayed || date > entry.lastPlayed) entry.lastPlayed = date
      entry.byType.set(
        row.plans.service_type_id,
        (entry.byType.get(row.plans.service_type_id) ?? 0) + 1,
      )
      bySong.set(row.song_id, entry)
    }
    const report = (songs ?? [])
      .map((song) => ({ song, stats: bySong.get(song.id) }))
      .filter((r) => r.stats)
      .sort(
        (a, b) =>
          b.stats!.total - a.stats!.total ||
          a.song.title.localeCompare(b.song.title),
      )
    return { report, typeNames }
  }, [rows, songs, since, today])

  const typeColumns = [...typeNames.entries()]

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Song usage"
        backTo="/songs"
        backLabel="Songs"
        description="How often each song has been played, and where."
        actions={
          <Select value={window_} onValueChange={setWindow}>
            <SelectTrigger className="w-40" aria-label="Report window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isPending || songsPending ? (
        <Skeleton className="h-64 w-full" />
      ) : report.length === 0 ? (
        <EmptyState icon={Music} title="No songs were played in this period." />
      ) : (
        <Card className="overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Song</TableHead>
                <TableHead className="text-right">Plays</TableHead>
                <TableHead>Last played</TableHead>
                {typeColumns.map(([id, name]) => (
                  <TableHead key={id} className="text-right">
                    {name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.map(({ song, stats }) => (
                <TableRow
                  key={song.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/songs/${song.id}`)}
                >
                  <TableCell className="font-medium">{song.title}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {stats!.total}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {stats!.lastPlayed ? formatPlanDateShort(stats!.lastPlayed) : '—'}
                  </TableCell>
                  {typeColumns.map(([id]) => (
                    <TableCell key={id} className="text-muted-foreground text-right tabular-nums">
                      {stats!.byType.get(id) ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
