import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { ArrowRight, CalendarCheck, CalendarDays, Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { DeclineDialog } from '@/features/scheduling/my-schedule-page'
import {
  useMyAssignments,
  useRespondInApp,
  type MyAssignment,
} from '@/features/scheduling/use-assignments'
import {
  formatPlanDate,
  formatStartTime,
  todayISODate,
} from '@/features/services/service-utils'
import { usePlans } from '@/features/services/use-plans'

export function DashboardPage() {
  const { data: me, isPending: mePending } = useCurrentPerson()
  const { data: plans, isPending: plansPending } = usePlans()
  const { data: assignments } = useMyAssignments(me?.id)
  const respond = useRespondInApp()
  const [declining, setDeclining] = useState<MyAssignment | null>(null)

  const today = todayISODate()
  const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd')

  const thisWeek = useMemo(
    () =>
      (plans ?? [])
        .filter((p) => p.date >= today && p.date <= weekEnd)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [plans, today, weekEnd],
  )
  const nextPlan = useMemo(
    () =>
      (plans ?? [])
        .filter((p) => p.date > weekEnd)
        .sort((a, b) => a.date.localeCompare(b.date))[0],
    [plans, weekEnd],
  )

  const myPending = useMemo(
    () =>
      (assignments ?? []).filter(
        (a) => a.plans.date >= today && a.status === 'pending' && a.notified_at,
      ),
    [assignments, today],
  )
  const myUpcoming = useMemo(
    () =>
      (assignments ?? [])
        .filter((a) => a.plans.date >= today && a.status === 'confirmed')
        .slice(0, 3),
    [assignments, today],
  )

  const firstName = me?.first_name

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {firstName ? `G'day, ${firstName}` : 'Home'}
      </h1>

      {myPending.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle>Waiting on you</CardTitle>
            <CardDescription>
              {myPending.length === 1
                ? 'You have a request to serve.'
                : `You have ${myPending.length} requests to serve.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {myPending.map((assignment) => (
              <div
                key={assignment.id}
                className="flex flex-col gap-2 rounded-md border px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatPlanDate(assignment.plans.date)}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {assignment.positions.name} · {assignment.teams.name}
                  </p>
                </div>
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
          <CardTitle>This week</CardTitle>
          <CardDescription>Services in the next 7 days.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {plansPending || mePending ? (
            <Skeleton className="h-14 w-full" />
          ) : thisWeek.length === 0 ? (
            <div className="text-muted-foreground flex flex-col gap-2 py-2 text-sm">
              <p className="flex items-center gap-2">
                <CalendarDays className="size-4" />
                No services this week.
              </p>
              {nextPlan && (
                <Link
                  to={`/services/plans/${nextPlan.id}`}
                  className="text-foreground hover:underline"
                >
                  Next up: {formatPlanDate(nextPlan.date)} — {nextPlan.service_types.name}
                </Link>
              )}
            </div>
          ) : (
            thisWeek.map((plan) => (
              <Link
                key={plan.id}
                to={`/services/plans/${plan.id}`}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatPlanDate(plan.date)}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {plan.service_types.name}
                    {plan.title ? ` — ${plan.title}` : ''}
                    {plan.start_time ?? plan.service_types.default_start_time
                      ? ` · ${formatStartTime(plan.start_time ?? plan.service_types.default_start_time)}`
                      : ''}
                  </p>
                </div>
                {plan.status === 'draft' && <Badge variant="outline">Draft</Badge>}
                <ArrowRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My upcoming dates</CardTitle>
          <CardDescription>Where you're confirmed to serve next.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {myUpcoming.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
              <CalendarCheck className="size-4" />
              Nothing confirmed yet.
            </p>
          ) : (
            myUpcoming.map((assignment) => (
              <Link
                key={assignment.id}
                to={`/services/plans/${assignment.plan_id}`}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatPlanDate(assignment.plans.date)}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {assignment.positions.name} · {assignment.teams.name}
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            ))
          )}
          <div className="pt-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/my-schedule">
                Full schedule & blockouts
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <DeclineDialog assignment={declining} onClose={() => setDeclining(null)} />
    </div>
  )
}
