import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, CalendarX, Loader2, Plus, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AssignPersonDialog,
  type PickerTarget,
} from '@/features/scheduling/scheduling-panel'
import {
  ASSIGNMENT_STATUS_CLASSES,
  ASSIGNMENT_STATUS_LABELS,
  isBlockedOut,
} from '@/features/scheduling/scheduling-utils'
import {
  useDeleteAssignment,
  useSendRequests,
  type AssignmentWithPerson,
} from '@/features/scheduling/use-assignments'
import { useBlockouts } from '@/features/scheduling/use-blockouts'
import { useAllPositions, useTeams } from '@/features/scheduling/use-teams'
import { supabase } from '@/lib/supabase'
import { splitUpcomingPast, usePlans, type PlanWithType } from '@/features/services/use-plans'

const MATRIX_PLAN_COUNT = 8

/** Assignments for all matrix plans in one query, grouped by plan. */
function useMatrixAssignments(planIds: string[]) {
  return useQuery({
    queryKey: ['assignments-matrix', [...planIds].sort()],
    enabled: planIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_assignments')
        .select('*, people(*)')
        .in('plan_id', planIds)
      if (error) throw new Error(error.message)
      const byPlan: Record<string, AssignmentWithPerson[]> = {}
      for (const row of data as AssignmentWithPerson[]) {
        ;(byPlan[row.plan_id] ??= []).push(row)
      }
      return byPlan
    },
  })
}

function MatrixCell({
  plan,
  assignments,
  teamServesPlan,
  onAdd,
  onReplace,
}: {
  plan: PlanWithType
  assignments: AssignmentWithPerson[]
  teamServesPlan: boolean
  onAdd: () => void
  onReplace: (assignmentId: string) => void
}) {
  const { data: blockouts } = useBlockouts()
  const deleteAssignment = useDeleteAssignment(plan.id)

  if (!teamServesPlan) {
    return <td className="text-muted-foreground/40 border-l p-2 text-center">—</td>
  }

  return (
    <td className="border-l p-1.5 align-top">
      <div className="flex min-w-32 flex-col gap-1">
        {assignments.map((assignment) => {
          const blocked = isBlockedOut(blockouts ?? [], assignment.person_id, plan.date)
          return (
            <DropdownMenu key={assignment.id}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium ${ASSIGNMENT_STATUS_CLASSES[assignment.status]}`}
                >
                  {blocked && <CalendarX className="size-3 shrink-0" />}
                  <span className="truncate">
                    {assignment.people.first_name}{' '}
                    {assignment.people.last_name.charAt(0)}.
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>
                  {assignment.people.first_name} {assignment.people.last_name} ·{' '}
                  {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                  {assignment.status === 'pending' && !assignment.notified_at
                    ? ' (not sent)'
                    : ''}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {assignment.status === 'declined' && (
                  <DropdownMenuItem onClick={() => onReplace(assignment.id)}>
                    Find replacement
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    deleteAssignment.mutate(assignment.id, {
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  <X className="size-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })}
        <button
          type="button"
          onClick={onAdd}
          className="text-muted-foreground/60 hover:bg-accent hover:text-foreground flex items-center justify-center rounded-md border border-dashed px-2 py-1 text-xs"
          aria-label="Schedule someone"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </td>
  )
}

function SendColumnButton({ plan, unsent }: { plan: PlanWithType; unsent: number }) {
  const sendRequests = useSendRequests(plan.id)
  if (unsent === 0) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-xs"
      disabled={sendRequests.isPending}
      onClick={() =>
        sendRequests.mutate(undefined, {
          onSuccess: (result) => {
            if (result.sent > 0) toast.success(`${result.sent} sent`)
            for (const skip of result.skipped) {
              toast.warning(`${skip.name}: ${skip.reason}`)
            }
          },
          onError: (e) => toast.error(e.message),
        })
      }
    >
      {sendRequests.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Send className="size-3" />
      )}
      Send {unsent}
    </Button>
  )
}

/**
 * Weeks × positions grid across upcoming plans, with inline scheduling —
 * roster a month in one sitting.
 */
export function MatrixPage() {
  const plansQuery = usePlans()
  const { data: teams, isPending: teamsPending } = useTeams()
  const { data: positions } = useAllPositions()

  const [typeFilter, setTypeFilter] = useState('all')
  const [picker, setPicker] = useState<(PickerTarget & { plan: PlanWithType }) | null>(null)

  const matrixPlans = useMemo(() => {
    const { upcoming } = splitUpcomingPast(plansQuery.data ?? [])
    return upcoming
      .filter((p) => typeFilter === 'all' || p.service_type_id === typeFilter)
      .slice(0, MATRIX_PLAN_COUNT)
  }, [plansQuery.data, typeFilter])

  const planIds = useMemo(() => matrixPlans.map((p) => p.id), [matrixPlans])
  const assignmentsQuery = useMatrixAssignments(planIds)
  const assignmentsByPlan = assignmentsQuery.data ?? {}

  const serviceTypes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of plansQuery.data ?? []) {
      seen.set(p.service_type_id, p.service_types.name)
    }
    return [...seen.entries()]
  }, [plansQuery.data])

  if (plansQuery.isError) return <FullPageError message={plansQuery.error.message} />

  const loading = plansQuery.isPending || teamsPending

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
          <Link to="/services">
            <ArrowLeft className="size-4" />
            Services
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Matrix</h1>
          {serviceTypes.length > 1 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48" aria-label="Filter by service type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All service types</SelectItem>
                {serviceTypes.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          The next {matrixPlans.length || ''} services side by side — click a
          cell to schedule.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : matrixPlans.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No upcoming plans. Create some from the Services page first.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-x-auto py-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="bg-card sticky left-0 z-10 min-w-36 border-b p-2 text-left font-medium">
                  Position
                </th>
                {matrixPlans.map((plan) => (
                  <th key={plan.id} className="min-w-32 border-b border-l p-2 text-left">
                    <Link
                      to={`/services/plans/${plan.id}`}
                      className="font-medium hover:underline"
                    >
                      {format(parseISO(plan.date), 'EEE d MMM')}
                    </Link>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
                      {plan.service_types.name}
                      {plan.status === 'draft' && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          Draft
                        </Badge>
                      )}
                    </div>
                    <SendColumnButton
                      plan={plan}
                      unsent={
                        (assignmentsByPlan[plan.id] ?? []).filter(
                          (a) => a.status === 'pending' && !a.notified_at,
                        ).length
                      }
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(teams ?? []).map((team) => {
                const teamPositions = (positions ?? []).filter(
                  (p) => p.team_id === team.id,
                )
                if (teamPositions.length === 0) return null
                return [
                  <tr key={team.id}>
                    <td
                      colSpan={matrixPlans.length + 1}
                      className="bg-muted/50 text-muted-foreground border-b px-2 py-1 text-xs font-semibold tracking-wide uppercase"
                    >
                      {team.name}
                    </td>
                  </tr>,
                  ...teamPositions.map((position) => (
                    <tr key={position.id} className="border-b last:border-b-0">
                      <td className="bg-card sticky left-0 z-10 p-2 align-top font-medium">
                        {position.name}
                      </td>
                      {matrixPlans.map((plan) => (
                        <MatrixCell
                          key={plan.id}
                          plan={plan}
                          assignments={(assignmentsByPlan[plan.id] ?? []).filter(
                            (a) => a.position_id === position.id,
                          )}
                          teamServesPlan={
                            !team.service_type_id ||
                            team.service_type_id === plan.service_type_id
                          }
                          onAdd={() => setPicker({ plan, team, position })}
                          onReplace={(assignmentId) =>
                            setPicker({
                              plan,
                              team,
                              position,
                              replaceAssignmentId: assignmentId,
                            })
                          }
                        />
                      ))}
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        </Card>
      )}

      {picker && (
        <AssignPersonDialog
          plan={picker.plan}
          target={picker}
          onClose={() => setPicker(null)}
          assignments={assignmentsByPlan[picker.plan.id] ?? []}
        />
      )}
    </div>
  )
}
