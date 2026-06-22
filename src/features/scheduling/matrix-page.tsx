import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO } from 'date-fns'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Mail,
  Minus,
  Music,
  Plus,
  Repeat,
  Send,
  Trash2,
  UserPlus,
} from 'lucide-react'
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
} from '@/features/scheduling/scheduling-utils'
import {
  useCancelAssignment,
  useDeleteAssignment,
  useSendRequests,
  type AssignmentWithPerson,
} from '@/features/scheduling/use-assignments'
import {
  buildPlanValidation,
  resultsByPerson,
  resultsByPosition,
  useSchedulingRulesData,
} from '@/features/scheduling/use-service-state'
import { worstSeverity, type RuleResult } from '@/features/scheduling/validate-service'
import { fillMatrixWindow } from '@/features/scheduling/matrix-utils'
import { SuggestRosterButton } from '@/features/scheduling/auto-schedule-dialog'
import { MatrixTeamOrderDialog } from '@/features/scheduling/matrix-team-order-dialog'
import {
  applyTeamOrder,
  useMatrixTeamOrder,
} from '@/features/scheduling/use-matrix-team-order'
import {
  MATRIX_PLAN_COUNT_MAX,
  MATRIX_PLAN_COUNT_MIN,
  useMatrixPlanCount,
} from '@/features/scheduling/use-matrix-plan-count'
import {
  serviceTypeTeamSort,
  teamServesType,
  useAllPositions,
  useTeams,
} from '@/features/scheduling/use-teams'
import { supabase } from '@/lib/supabase'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  computeItemTimes,
  formatClock,
  todayISODate,
  type PlanItem,
} from '@/features/services/service-utils'
import {
  usePlanItems,
  useReorderPlanItems,
} from '@/features/services/use-plan-items'
import { usePlans, type PlanWithType } from '@/features/services/use-plans'

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
  positionResults,
  personResultsById,
  onAdd,
  onReplace,
}: {
  plan: PlanWithType
  assignments: AssignmentWithPerson[]
  teamServesPlan: boolean
  /** Coverage results for this position in this plan (issue #34). */
  positionResults: RuleResult[]
  /** person_id → that person's validation results in this plan. */
  personResultsById: Map<string, RuleResult[]>
  onAdd: () => void
  onReplace: (assignmentId: string, wasNotified: boolean) => void
}) {
  const deleteAssignment = useDeleteAssignment(plan.id)
  const cancelAssignment = useCancelAssignment(plan.id)
  const sendRequests = useSendRequests(plan.id)

  // Mirror the plan page: re-send a single person's request email (#15).
  function sendOne(assignmentId: string) {
    sendRequests.mutate([assignmentId], {
      onSuccess: (result) => {
        if (result.sent > 0) toast.success('Email sent')
        for (const skip of result.skipped) {
          toast.warning(`${skip.name}: ${skip.reason}`)
        }
        if (result.sent === 0 && result.skipped.length === 0) {
          toast.info('Nothing to send')
        }
      },
      onError: (e) => toast.error(e.message),
    })
  }

  // Mirror the plan page (issue #16/#21): removing a confirmed person notifies
  // them with a cancellation email; removing anyone else is a silent delete.
  function removeAndNotify(assignmentId: string) {
    cancelAssignment.mutate(assignmentId, {
      onSuccess: (result) =>
        toast.success(
          result.notified ? 'Removed · cancellation email sent' : 'Removed',
        ),
      onError: (e) => toast.error(e.message),
    })
  }

  if (!teamServesPlan) {
    return <td className="text-muted-foreground/40 border-l p-2 text-center">—</td>
  }

  const understaffed = positionResults.some((r) => r.code === 'MANDATORY_UNFILLED')

  return (
    <td className="border-l p-1.5 align-top">
      <div className="flex min-w-32 flex-col gap-1">
        {assignments.map((assignment) => {
          const results =
            assignment.status === 'declined'
              ? []
              : personResultsById.get(assignment.person_id) ?? []
          const severity = worstSeverity(results)
          const SeverityIcon = severity === 'error' ? AlertTriangle : AlertCircle
          return (
            <div
              key={assignment.id}
              title={results.map((r) => r.message).join('\n') || undefined}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${ASSIGNMENT_STATUS_CLASSES[assignment.status]}`}
            >
              {severity && (
                <SeverityIcon
                  className={`size-3 shrink-0 ${
                    severity === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                />
              )}
              <Link
                to={`/people/${assignment.person_id}`}
                className="truncate hover:underline"
              >
                {assignment.people.first_name}{' '}
                {assignment.people.last_name.charAt(0)}.
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Assignment actions"
                    className="ml-auto shrink-0 rounded px-1 font-bold leading-none opacity-70 hover:opacity-100"
                  >
                    …
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
                  <DropdownMenuItem
                    onClick={() => onReplace(assignment.id, false)}
                  >
                    <UserPlus className="size-4" />
                    Find replacement
                  </DropdownMenuItem>
                )}
                {/* Replace only while pending — confirmed people get
                    removed-and-notified instead (issue #85). */}
                {assignment.status === 'pending' && (
                  <DropdownMenuItem
                    onClick={() =>
                      onReplace(assignment.id, !!assignment.notified_at)
                    }
                  >
                    <Repeat className="size-4" />
                    Replace…
                  </DropdownMenuItem>
                )}
                {assignment.status !== 'declined' &&
                  (assignment.people.email ||
                    assignment.people.managed_by_person_id) && (
                  <DropdownMenuItem onClick={() => sendOne(assignment.id)}>
                    <Mail className="size-4" />
                    Send email
                  </DropdownMenuItem>
                )}
                {assignment.status === 'confirmed' ||
                (assignment.status === 'pending' && assignment.notified_at) ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => removeAndNotify(assignment.id)}
                  >
                    <Trash2 className="size-4" />
                    Remove and Notify
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      deleteAssignment.mutate(assignment.id, {
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
        <button
          type="button"
          onClick={onAdd}
          title={understaffed ? positionResults.map((r) => r.message).join('\n') : undefined}
          className={
            understaffed
              ? 'flex items-center justify-center rounded-md border border-dashed border-red-500/60 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
              : 'text-muted-foreground/60 hover:bg-accent hover:text-foreground flex items-center justify-center rounded-md border border-dashed px-2 py-1 text-xs'
          }
          aria-label={understaffed ? 'Understaffed — schedule someone' : 'Schedule someone'}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </td>
  )
}

function SendColumnButton({ plan, unsent }: { plan: PlanWithType; unsent: number }) {
  const sendRequests = useSendRequests(plan.id)
  const tooltip =
    unsent > 0
      ? `Send ${unsent} request${unsent === 1 ? '' : 's'}`
      : 'No requests to send'
  return (
    <Button
      variant="outline"
      size="sm"
      className="size-6 shrink-0 border-muted-foreground/40 p-0"
      title={tooltip}
      aria-label={tooltip}
      disabled={unsent === 0 || sendRequests.isPending}
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
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Send className="size-3.5" />
      )}
    </Button>
  )
}

/** Cancel every pending, un-notified assignment for one plan from the Matrix.
    No email is sent since nobody was notified — the rows are simply deleted. */
function CancelUnsentColumnButton({
  plan,
  unsentIds,
}: {
  plan: PlanWithType
  unsentIds: string[]
}) {
  const deleteAssignment = useDeleteAssignment(plan.id)
  const tooltip =
    unsentIds.length > 0
      ? `Cancel ${unsentIds.length} unsent request${unsentIds.length === 1 ? '' : 's'}`
      : 'No unsent requests to cancel'
  return (
    <Button
      variant="outline"
      size="sm"
      className="size-6 shrink-0 border-muted-foreground/40 p-0"
      title={tooltip}
      aria-label={tooltip}
      disabled={unsentIds.length === 0 || deleteAssignment.isPending}
      onClick={() =>
        Promise.allSettled(
          unsentIds.map((id) => deleteAssignment.mutateAsync(id)),
        ).then((results) => {
          const failed = results.filter((r) => r.status === 'rejected').length
          const removed = results.length - failed
          if (removed > 0) {
            toast.success(
              `${removed} unsent assignment${removed === 1 ? '' : 's'} cancelled`,
            )
          }
          if (failed > 0) toast.error(`${failed} could not be cancelled`)
        })
      }
    >
      {deleteAssignment.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <CircleX className="size-3.5" />
      )}
    </Button>
  )
}

/** One draggable order-of-service row inside a Matrix ORDER cell (issue #79). */
function OrderItemRow({
  item,
  startsAt,
  canManage,
}: {
  item: PlanItem
  startsAt: Date | null
  canManage: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canManage })
  const isHeader = item.kind === 'header'
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded px-1 py-0.5 ${
        isDragging ? 'bg-accent relative z-10' : ''
      }`}
    >
      {canManage && (
        <button
          type="button"
          className="text-muted-foreground/50 hover:text-foreground -ml-0.5 shrink-0 cursor-grab touch-none"
          aria-label={`Reorder ${item.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3" />
        </button>
      )}
      {startsAt && (
        <span className="text-muted-foreground w-8 shrink-0 text-right text-[11px] tabular-nums">
          {formatClock(startsAt)}
        </span>
      )}
      {item.kind === 'song' && (
        <Music className="text-muted-foreground size-3 shrink-0" />
      )}
      <span
        className={
          isHeader
            ? 'text-muted-foreground min-w-0 truncate text-[11px] font-semibold tracking-wide uppercase'
            : 'min-w-0 truncate text-xs'
        }
      >
        {item.title}
      </span>
    </div>
  )
}

/**
 * A plan's order of service in one Matrix column (issue #79) — songs and items
 * in order with their running start times, each with a drag handle to reorder
 * this plan's order of service inline. Reorders persist via the same hook the
 * plan page uses, so the two views stay in sync.
 */
function MatrixOrderCell({
  plan,
  canManage,
}: {
  plan: PlanWithType
  canManage: boolean
}) {
  const { data, isPending } = usePlanItems(plan.id)
  const reorder = useReorderPlanItems(plan.id)
  const items = useMemo(() => data ?? [], [data])
  const { timed } = useMemo(
    () =>
      computeItemTimes(
        items,
        plan.date,
        plan.start_time ?? plan.service_types.default_start_time,
      ),
    [items, plan.date, plan.start_time, plan.service_types.default_start_time],
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorder.mutate(arrayMove(items, oldIndex, newIndex), {
      onError: (e) => toast.error(e.message),
    })
  }

  if (isPending) {
    return (
      <td className="border-l p-1.5 align-top">
        <Skeleton className="h-8 w-full" />
      </td>
    )
  }
  if (items.length === 0) {
    return (
      <td className="text-muted-foreground/40 border-l p-2 text-center align-top text-xs">
        —
      </td>
    )
  }

  return (
    <td className="border-l p-1.5 align-top">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex min-w-32 flex-col gap-0.5">
            {timed.map(({ item, startsAt }) => (
              <OrderItemRow
                key={item.id}
                item={item}
                startsAt={startsAt}
                canManage={canManage}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </td>
  )
}

/**
 * Weeks × positions grid across upcoming plans, with inline scheduling —
 * roster a month in one sitting.
 */
export function MatrixPage() {
  const plansQuery = usePlans()
  const { data: me } = useCurrentPerson()
  const { data: teams, isPending: teamsPending } = useTeams()
  const { data: positions } = useAllPositions()

  // Only admins/leaders can reorder a plan's order of service (issue #79); RLS
  // enforces it too, so members see the list read-only (no drag handles).
  const canManage = me?.role === 'admin' || me?.role === 'leader'

  const [typeFilter, setTypeFilter] = useState('all')
  const [picker, setPicker] = useState<(PickerTarget & { plan: PlanWithType }) | null>(null)
  const [orderOpen, setOrderOpen] = useState(false)
  // Window offset (issue #67): 0 = window starts at the next upcoming service;
  // the ← / → buttons step it one service earlier / later (into the past too).
  const [weekOffset, setWeekOffset] = useState(0)
  // Collapsed (hidden) plan columns (issue #68); the window fills the next plan
  // in to keep the column count steady.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const { order, saveOrder } = useMatrixTeamOrder()
  const { count: planCount, setCount: setPlanCount } = useMatrixPlanCount()

  // All plans for the current filter, oldest → newest (issue #67 pages over these).
  const filteredPlans = useMemo(
    () =>
      (plansQuery.data ?? [])
        .filter((p) => typeFilter === 'all' || p.service_type_id === typeFilter)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [plansQuery.data, typeFilter],
  )

  // Default window starts at the next upcoming plan (today or later); if every
  // plan is past, show the last full window.
  const defaultStart = useMemo(() => {
    const today = todayISODate()
    const idx = filteredPlans.findIndex((p) => p.date >= today)
    return idx === -1 ? Math.max(0, filteredPlans.length - planCount) : idx
  }, [filteredPlans, planCount])

  const maxStart = Math.max(0, filteredPlans.length - planCount)
  const startIndex = Math.min(Math.max(defaultStart + weekOffset, 0), maxStart)

  // Visible columns: planCount plans from startIndex, skipping collapsed ones (#68).
  const matrixPlans = useMemo(
    () => fillMatrixWindow(filteredPlans, startIndex, planCount, collapsedIds),
    [filteredPlans, startIndex, planCount, collapsedIds],
  )

  // Collapsed plans still within the current filter — shown as a restore strip (#68).
  const collapsedPlans = useMemo(
    () => filteredPlans.filter((p) => collapsedIds.has(p.id)),
    [filteredPlans, collapsedIds],
  )

  function collapsePlan(id: string) {
    setCollapsedIds((prev) => new Set(prev).add(id))
  }
  function restorePlan(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // The single service type currently shown — either the explicit filter, or the
  // only type present in the window (issue #70). Null when several types mix.
  const displayedTypeId = useMemo(() => {
    if (typeFilter !== 'all') return typeFilter
    const ids = new Set(matrixPlans.map((p) => p.service_type_id))
    return ids.size === 1 ? [...ids][0] : null
  }, [typeFilter, matrixPlans])

  // Team section order (issues #33/#70). When a single service type is displayed,
  // order teams by that type's setup order (#31, matching the plan page); when
  // several types mix, use the user's personal saved order (localStorage).
  const sortedTeams = useMemo(() => {
    const list = teams ?? []
    if (displayedTypeId) {
      return [...list].sort(
        (a, b) =>
          serviceTypeTeamSort(a, displayedTypeId) -
            serviceTypeTeamSort(b, displayedTypeId) || a.name.localeCompare(b.name),
      )
    }
    return applyTeamOrder(list, order)
  }, [teams, displayedTypeId, order])

  // Teams that actually render in the Matrix (have ≥1 position) — the reorder
  // popup lists exactly these, in the current effective order.
  const reorderableTeams = useMemo(
    () => sortedTeams.filter((t) => (positions ?? []).some((p) => p.team_id === t.id)),
    [sortedTeams, positions],
  )

  const planIds = useMemo(() => matrixPlans.map((p) => p.id), [matrixPlans])
  const assignmentsQuery = useMatrixAssignments(planIds)
  const assignmentsByPlan = assignmentsQuery.data ?? {}

  // Live scheduling-rules validation per plan (issue #34). One shared data load;
  // validate each visible plan against its column of assignments.
  const rules = useSchedulingRulesData()
  const validationByPlan = useMemo(() => {
    const map = new Map<
      string,
      { byPosition: Map<string, RuleResult[]>; byPerson: Map<string, RuleResult[]> }
    >()
    if (rules.isPending) return map
    for (const plan of matrixPlans) {
      const { all } = buildPlanValidation(plan, assignmentsByPlan[plan.id] ?? [], rules.data)
      map.set(plan.id, { byPosition: resultsByPosition(all), byPerson: resultsByPerson(all) })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixPlans, assignmentsQuery.data, rules.isPending, rules.data])

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
          <div className="flex flex-wrap items-center gap-x-12 gap-y-2">
            {/* Week paging (issue #67): shift the window one service earlier/later. */}
            <div className="flex items-center justify-center gap-1.5 [&_button]:border-foreground/30">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  disabled={startIndex <= 0}
                  aria-label="Show earlier services"
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                {/* Jump back to the next-upcoming service (window default). */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setWeekOffset(0)}
                  disabled={weekOffset === 0}
                  aria-label="Show today's upcoming services"
                >
                  Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  disabled={startIndex >= maxStart}
                  aria-label="Show later services"
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            {/* Services-shown slider (issue #57): default 4, clamped 2–9. */}
            <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
              <span className="text-muted-foreground text-xs font-medium">Columns</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-5"
                  onClick={() => setPlanCount(planCount - 1)}
                  disabled={planCount <= MATRIX_PLAN_COUNT_MIN}
                  aria-label="Show fewer services"
                >
                  <Minus className="size-3" />
                </Button>
                <span
                  className="w-4 text-center text-sm tabular-nums"
                  aria-live="polite"
                >
                  {planCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-5"
                  onClick={() => setPlanCount(planCount + 1)}
                  disabled={planCount >= MATRIX_PLAN_COUNT_MAX}
                  aria-label="Show more services"
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
            {/* Reorder is personal-order only — hidden when one type is shown (#70). */}
            {!displayedTypeId && reorderableTeams.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrderOpen(true)}
              >
                <ArrowUpDown className="size-4" />
                Reorder teams
              </Button>
            )}
            {serviceTypes.length > 1 && (
              <Select
                value={typeFilter}
                onValueChange={(v) => {
                  setTypeFilter(v)
                  setWeekOffset(0)
                  setCollapsedIds(new Set())
                }}
              >
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
        </div>
        <p className="text-muted-foreground text-sm">
          {matrixPlans.length || ''} services side by side — use the Columns
          buttons to change how many are shown; click a cell to schedule.
        </p>
      </div>

      {/* Restore strip for collapsed columns (issue #68). */}
      {collapsedPlans.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Hidden:</span>
          {collapsedPlans.map((plan) => (
            <Button
              key={plan.id}
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={() => restorePlan(plan.id)}
              title="Show this column again"
            >
              <Eye className="size-3.5" />
              {format(parseISO(plan.date), 'EEE d MMM')}
            </Button>
          ))}
        </div>
      )}

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
                {/* Position label removed (issue #79); cell kept for layout. */}
                <th className="bg-card sticky left-0 z-10 min-w-36 border-b p-2 text-left font-medium" />

                {matrixPlans.map((plan) => (
                  <th key={plan.id} className="min-w-32 border-b border-l p-2 text-left">
                    <div className="flex items-start justify-between gap-1">
                      <Link
                        to={`/services/plans/${plan.id}`}
                        state={{ from: '/services/matrix' }}
                        className="font-medium hover:underline"
                      >
                        {format(parseISO(plan.date), 'EEE d MMM')}
                      </Link>
                      {/* Collapse (hide) this column (issue #68). */}
                      <button
                        type="button"
                        onClick={() => collapsePlan(plan.id)}
                        className="text-muted-foreground/60 hover:text-foreground -mt-0.5 -mr-1 shrink-0 p-0.5"
                        title="Hide this column"
                        aria-label={`Hide ${format(parseISO(plan.date), 'EEE d MMM')}`}
                      >
                        <EyeOff className="size-3.5" />
                      </button>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
                      {plan.service_types.name}
                      {plan.status === 'draft' && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          Draft
                        </Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ORDER section (issue #79): each plan's order of service,
                  reorderable inline. Sits before the team sections. */}
              <tr>
                <td
                  colSpan={matrixPlans.length + 1}
                  className="bg-muted/50 text-muted-foreground border-b p-0 text-xs font-semibold tracking-wide uppercase"
                >
                  <div className="sticky left-0 inline-block px-2 py-1">Order</div>
                </td>
              </tr>
              <tr className="border-b">
                <td className="bg-card sticky left-0 z-10 p-2 align-top" />
                {matrixPlans.map((plan) => (
                  <MatrixOrderCell key={plan.id} plan={plan} canManage={canManage} />
                ))}
              </tr>
              {sortedTeams.map((team, teamIndex) => {
                const teamPositions = (positions ?? []).filter(
                  (p) => p.team_id === team.id,
                )
                if (teamPositions.length === 0) return null
                // The first team heading carries a per-column "Suggest roster"
                // button that auto-fills that service's whole roster.
                const showSuggest = teamIndex === 0 && canManage
                return [
                  <tr key={team.id}>
                    {showSuggest ? (
                      <>
                        <td className="bg-muted/50 text-muted-foreground sticky left-0 z-10 border-b p-0 text-xs font-semibold tracking-wide uppercase">
                          <Link
                            to={`/teams/${team.id}`}
                            className="inline-block px-2 py-1 hover:underline"
                          >
                            {team.name}
                          </Link>
                        </td>
                        {matrixPlans.map((plan) => (
                          <td
                            key={plan.id}
                            className="bg-muted/50 border-b border-l p-1 align-middle"
                          >
                            {(() => {
                              const unsentIds = (assignmentsByPlan[plan.id] ?? [])
                                .filter(
                                  (a) =>
                                    a.status === 'pending' && !a.notified_at,
                                )
                                .map((a) => a.id)
                              return (
                                <div className="flex items-center justify-start gap-1">
                                  <SuggestRosterButton plan={plan} compact />
                                  <SendColumnButton
                                    plan={plan}
                                    unsent={unsentIds.length}
                                  />
                                  <CancelUnsentColumnButton
                                    plan={plan}
                                    unsentIds={unsentIds}
                                  />
                                </div>
                              )
                            })()}
                          </td>
                        ))}
                      </>
                    ) : (
                      <td
                        colSpan={matrixPlans.length + 1}
                        className="bg-muted/50 text-muted-foreground border-b p-0 text-xs font-semibold tracking-wide uppercase"
                      >
                        {/* Team name links to the team view (issue #74). */}
                        <Link
                          to={`/teams/${team.id}`}
                          className="sticky left-0 inline-block px-2 py-1 hover:underline"
                        >
                          {team.name}
                        </Link>
                      </td>
                    )}
                  </tr>,
                  ...teamPositions.map((position) => (
                    <tr key={position.id} className="border-b last:border-b-0">
                      <td className="bg-card sticky left-0 z-10 p-2 align-top font-medium">
                        {position.name}
                      </td>
                      {matrixPlans.map((plan) => {
                        const planValidation = validationByPlan.get(plan.id)
                        return (
                          <MatrixCell
                            key={plan.id}
                            plan={plan}
                            assignments={(assignmentsByPlan[plan.id] ?? []).filter(
                              (a) => a.position_id === position.id,
                            )}
                            teamServesPlan={teamServesType(team, plan.service_type_id)}
                            positionResults={
                              planValidation?.byPosition.get(position.id) ?? []
                            }
                            personResultsById={
                              planValidation?.byPerson ?? new Map()
                            }
                            onAdd={() => setPicker({ plan, team, position })}
                            onReplace={(assignmentId, wasNotified) =>
                              setPicker({
                                plan,
                                team,
                                position,
                                replaceAssignmentId: assignmentId,
                                replaceWasNotified: wasNotified,
                              })
                            }
                          />
                        )
                      })}
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

      {orderOpen && (
        <MatrixTeamOrderDialog
          onOpenChange={setOrderOpen}
          teams={reorderableTeams}
          onSave={saveOrder}
        />
      )}
    </div>
  )
}
