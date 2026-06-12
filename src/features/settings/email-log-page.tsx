import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FullPageError } from '@/components/full-page-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

function useEmailLog() {
  return useQuery({
    queryKey: ['email-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** Admin-only: the last 200 outbound emails, for troubleshooting delivery. */
export function EmailLogPage() {
  const { data: log, isPending, isError, error } = useEmailLog()

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
          <Link to="/settings">
            <ArrowLeft className="size-4" />
            Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Email log</h1>
        <p className="text-muted-foreground text-sm">
          The most recent emails sent by this instance.
        </p>
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
              {log.map((entry) => (
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
