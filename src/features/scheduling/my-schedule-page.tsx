import { useMemo, useState } from 'react'
import {
  CalendarCheck,
  CalendarX,
  Check,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { usePeopleManagedBy } from '@/features/people/use-people'
import { fullName } from '@/features/people/person-utils'
import { BlockoutDialog } from '@/features/scheduling/blockout-dialog'
import {
  ASSIGNMENT_STATUS_CLASSES,
  ASSIGNMENT_STATUS_LABELS,
} from '@/features/scheduling/scheduling-utils'
import {
  useMyAssignments,
  useRespondInApp,
  type MyAssignment,
} from '@/features/scheduling/use-assignments'
import {
  useBlockouts,
  useDeleteBlockout,
} from '@/features/scheduling/use-blockouts'
import {
  formatPlanDate,
  formatPlanDateShort,
  formatStartTime,
  todayISODate,
} from '@/features/services/service-utils'

/**
 * For a managed account (issue #89) the row belongs to the managed member, not
 * the signed-in manager — append "(for <name>)" with an italic "for". Returns
 * null for the manager's own rows.
 */
export function ForWhom({
  assignment,
  meId,
}: {
  assignment: MyAssignment
  meId: string | undefined
}) {
  if (!assignment.people || assignment.person_id === meId) return null
  return (
    <span className="text-muted-foreground font-normal">
      {' '}
      (<i>for</i> {fullName(assignment.people)})
    </span>
  )
}

function AssignmentSummary({
  assignment,
  meId,
}: {
  assignment: MyAssignment
  meId: string | undefined
}) {
  // The plan's own labelled times (rehearsal + service) win over the
  // service type's default start time.
  const planTimes = [...assignment.plans.plan_times].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  )
  const time =
    planTimes.length > 0
      ? planTimes
          .map((t) => `${t.label} ${formatStartTime(t.start_time) ?? ''}`.trim())
          .join(' · ')
      : formatStartTime(
          assignment.plans.start_time ??
            assignment.plans.service_types.default_start_time,
        )
  return (
    <div className="min-w-0 flex-1">
      <p className="font-medium">
        {formatPlanDate(assignment.plans.date)}
        <ForWhom assignment={assignment} meId={meId} />
      </p>
      <p className="text-muted-foreground truncate text-sm">
        {time ? `${time} · ` : ''}
        {assignment.positions.name} · {assignment.teams.name}
      </p>
    </div>
  )
}

export function DeclineDialog({
  assignment,
  onClose,
}: {
  assignment: MyAssignment | null
  onClose: () => void
}) {
  const respond = useRespondInApp()
  const [reason, setReason] = useState('')

  function decline() {
    if (!assignment) return
    respond.mutate(
      { id: assignment.id, status: 'declined', reason },
      {
        onSuccess: () => {
          onClose()
          setReason('')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open={!!assignment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline this request?</DialogTitle>
          <DialogDescription>
            Your leader will see your response straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="decline-reason">Reason (optional)</Label>
          <Textarea
            id="decline-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Away that weekend"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={decline} disabled={respond.isPending}>
            {respond.isPending && <Loader2 className="size-4 animate-spin" />}
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MySchedulePage() {
  const { data: me, isPending: mePending } = useCurrentPerson()
  const { data: managed } = usePeopleManagedBy(me?.id)
  const personIds = useMemo(
    () => (me ? [me.id, ...(managed ?? []).map((m) => m.id)] : undefined),
    [me, managed],
  )
  const { data: assignments, isPending } = useMyAssignments(personIds)
  const { data: allBlockouts, isPending: blockoutsPending } = useBlockouts()
  const respond = useRespondInApp()
  const deleteBlockout = useDeleteBlockout()
  const [declining, setDeclining] = useState<MyAssignment | null>(null)
  const [blockoutOpen, setBlockoutOpen] = useState(false)

  const today = todayISODate()
  const { pending, upcoming } = useMemo(() => {
    const current = (assignments ?? []).filter((a) => a.plans.date >= today)
    return {
      pending: current.filter((a) => a.status === 'pending' && a.notified_at),
      upcoming: current.filter((a) => a.status !== 'pending' || !a.notified_at),
    }
  }, [assignments, today])

  const relevantBlockouts = useMemo(() => {
    const ids = new Set(personIds ?? [])
    return (allBlockouts ?? []).filter((b) => ids.has(b.person_id))
  }, [allBlockouts, personIds])

  const currentBlockouts = useMemo(
    () => relevantBlockouts.filter((b) => b.end_date >= today),
    [relevantBlockouts, today],
  )

  const personNameById = useMemo(() => {
    const map = new Map<string, string>()
    if (me) map.set(me.id, fullName(me))
    ;(managed ?? []).forEach((p) => map.set(p.id, fullName(p)))
    return map
  }, [me, managed])

  const loading = mePending || isPending

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My Schedule" />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !me ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Your account isn't linked to a person record yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle>Waiting on you</CardTitle>
                <CardDescription>
                  Requests to serve — accept or decline.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {pending.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex flex-col gap-2 rounded-md border px-3 py-2.5 sm:flex-row sm:items-center"
                  >
                    <AssignmentSummary assignment={assignment} meId={me.id} />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 text-white hover:bg-green-700 sm:flex-none"
                        disabled={respond.isPending}
                        onClick={() =>
                          respond.mutate(
                            { id: assignment.id, status: 'confirmed' },
                            {
                              onSuccess: () => toast.success("You're confirmed!"),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                      >
                        <Check className="size-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 sm:flex-none"
                        disabled={respond.isPending}
                        onClick={() => setDeclining(assignment)}
                      >
                        <X className="size-4" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
              <CardDescription>Where you're scheduled to serve.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {upcoming.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                  <CalendarCheck className="size-4" />
                  Nothing coming up.
                </p>
              ) : (
                upcoming.map((assignment) => (
                  <Link
                    key={assignment.id}
                    to={`/services/plans/${assignment.plan_id}`}
                    className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-2"
                  >
                    <AssignmentSummary assignment={assignment} meId={me.id} />
                    <Badge className={ASSIGNMENT_STATUS_CLASSES[assignment.status]}>
                      {assignment.status === 'pending'
                        ? 'Not sent yet'
                        : ASSIGNMENT_STATUS_LABELS[assignment.status]}
                    </Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Blockouts</CardTitle>
                  <CardDescription>
                    Dates not available to be scheduled.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setBlockoutOpen(true)}>
                  <Plus className="size-4" />
                  Add blockout
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {blockoutsPending ? (
                <Skeleton className="h-10 w-full" />
              ) : currentBlockouts.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                  <CalendarX className="size-4" />
                  No upcoming blockouts.
                </p>
              ) : (
                currentBlockouts.map((blockout) => (
                  <div
                    key={blockout.id}
                    className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {blockout.start_date === blockout.end_date
                          ? formatPlanDateShort(blockout.start_date)
                          : `${formatPlanDateShort(blockout.start_date)} – ${formatPlanDateShort(blockout.end_date)}`}
                        {blockout.person_id !== me?.id && (
                          <span className="text-muted-foreground ml-1 text-xs italic">
                            ({personNameById.get(blockout.person_id)})
                          </span>
                        )}
                      </p>
                      {blockout.reason && (
                        <p className="text-muted-foreground truncate text-xs">
                          {blockout.reason}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() =>
                        deleteBlockout.mutate(blockout.id, {
                          onError: (e) => toast.error(e.message),
                        })
                      }
                      aria-label="Delete blockout"
                      title="Delete this blockout"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <DeclineDialog assignment={declining} onClose={() => setDeclining(null)} />
          {me && (
            <BlockoutDialog
              personId={me.id}
              open={blockoutOpen}
              onOpenChange={setBlockoutOpen}
            />
          )}
        </>
      )}
    </div>
  )
}
