import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarX,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
  UserPlus,
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { fullName } from '@/features/people/person-utils'
import { usePeople, type Person } from '@/features/people/use-people'
import {
  ASSIGNMENT_STATUS_CLASSES,
  ASSIGNMENT_STATUS_LABELS,
  isBlockedOut,
  PROFICIENCY_BADGE_CLASSES,
  timesOverlap,
  type Position,
  type Team,
} from '@/features/scheduling/scheduling-utils'
import {
  useAssignmentsOnDate,
  useCancelAssignment,
  useCreateAssignment,
  useDeleteAssignment,
  usePlanAssignments,
  useReplaceAssignment,
  useSendRequests,
  type AssignmentWithPerson,
} from '@/features/scheduling/use-assignments'
import { useBlockouts } from '@/features/scheduling/use-blockouts'
import {
  serviceTypeTeamSort,
  teamServesType,
  useAllPositions,
  useAllTeamMembers,
  useTeams,
} from '@/features/scheduling/use-teams'
import {
  resultsByPerson,
  resultsByPosition,
  usePlanValidation,
} from '@/features/scheduling/use-service-state'
import { RuleBadges } from '@/features/scheduling/validation-badges'
import type { PlanWithType } from '@/features/services/use-plans'

export interface PickerTarget {
  team: Team
  position: Position
  /** When replacing a declined assignment. */
  replaceAssignmentId?: string
}

export function AssignPersonDialog({
  plan,
  target,
  onClose,
  assignments,
}: {
  plan: PlanWithType
  target: PickerTarget | null
  onClose: () => void
  assignments: AssignmentWithPerson[]
}) {
  const { data: people } = usePeople()
  const { data: teamMembers } = useAllTeamMembers()
  const { data: blockouts } = useBlockouts()
  const { data: onDate } = useAssignmentsOnDate(plan.date)
  const createAssignment = useCreateAssignment(plan.id)
  const replaceAssignment = useReplaceAssignment(plan.id)
  const [search, setSearch] = useState('')

  const pending = createAssignment.isPending || replaceAssignment.isPending

  const { preferred, members, others, traineeIds } = useMemo(() => {
    if (!target)
      return {
        preferred: [],
        members: [],
        others: [],
        traineeIds: new Set<string>(),
      }
    const term = search.trim().toLowerCase()
    const assignedHere = new Set(
      assignments
        .filter(
          (a) =>
            a.position_id === target.position.id &&
            a.id !== target.replaceAssignmentId,
        )
        .map((a) => a.person_id),
    )
    const matches = (p: Person) =>
      p.status === 'active' &&
      !assignedHere.has(p.id) &&
      (term === '' || fullName(p).toLowerCase().includes(term))

    const teamMemberships = (teamMembers ?? []).filter(
      (m) => m.team_id === target.team.id,
    )
    const memberIds = new Set(teamMemberships.map((m) => m.person_id))
    // Members explicitly set up for this position in Teams (issue #12).
    const preferredIds = new Set(
      teamMemberships
        .filter((m) =>
          m.team_member_positions.some(
            (tp) => tp.position_id === target.position.id,
          ),
        )
        .map((m) => m.person_id),
    )
    // Trainees for this position (issue #30) — flagged so leaders notice.
    const traineeIds = new Set(
      teamMemberships
        .filter((m) =>
          m.team_member_positions.some(
            (tp) =>
              tp.position_id === target.position.id &&
              tp.proficiency === 'trainee',
          ),
        )
        .map((m) => m.person_id),
    )
    const all = (people ?? []).filter(matches)
    return {
      preferred: all.filter((p) => preferredIds.has(p.id)),
      members: all.filter((p) => memberIds.has(p.id) && !preferredIds.has(p.id)),
      others: all.filter((p) => !memberIds.has(p.id)),
      traineeIds,
    }
  }, [target, people, teamMembers, assignments, search])

  function warningsFor(personId: string) {
    const warnings: { icon: typeof CalendarX; label: string }[] = []
    if (isBlockedOut(blockouts ?? [], personId, plan.date)) {
      warnings.push({ icon: CalendarX, label: 'Blocked out' })
    }
    // Only warn when the other service's time actually overlaps this one
    // (issue #14): being on two services the same day at different times is OK.
    const planStart = plan.service_types.default_start_time
    const planEnd = plan.service_types.end_time
    const elsewhere = (onDate ?? []).filter(
      (a) =>
        a.person_id === personId &&
        a.status !== 'declined' &&
        a.id !== target?.replaceAssignmentId &&
        (a.plan_id === plan.id ||
          timesOverlap(
            planStart,
            planEnd,
            a.plans?.service_types?.default_start_time ?? null,
            a.plans?.service_types?.end_time ?? null,
          )),
    )
    if (elsewhere.length > 0) {
      warnings.push({
        icon: AlertTriangle,
        label: `Already scheduled (${elsewhere[0].teams?.name ?? 'another team'})`,
      })
    }
    return warnings
  }

  function pick(person: Person) {
    if (!target) return
    const values = {
      person_id: person.id,
      team_id: target.team.id,
      position_id: target.position.id,
    }
    const handlers = {
      onSuccess: () => {
        onClose()
        setSearch('')
      },
      onError: (e: Error) => toast.error(e.message),
    }
    if (target.replaceAssignmentId) {
      replaceAssignment.mutate(
        { oldAssignmentId: target.replaceAssignmentId, values },
        handlers,
      )
    } else {
      createAssignment.mutate(values, handlers)
    }
  }

  function PersonRow({ person }: { person: Person }) {
    const warnings = warningsFor(person.id)
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => pick(person)}
        className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-2 text-left disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {fullName(person)}
        </span>
        {traineeIds.has(person.id) && (
          <Badge
            variant="outline"
            className={`shrink-0 ${PROFICIENCY_BADGE_CLASSES.trainee}`}
          >
            Trainee
          </Badge>
        )}
        {warnings.map(({ icon: Icon, label }) => (
          <Badge
            key={label}
            variant="outline"
            className="shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400"
          >
            <Icon className="size-3" />
            {label}
          </Badge>
        ))}
      </button>
    )
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.replaceAssignmentId ? 'Find replacement' : 'Schedule someone'}
          </DialogTitle>
          <DialogDescription>
            {target ? `${target.position.name} · ${target.team.name}` : ''}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people…"
          autoFocus
        />
        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          {preferred.length > 0 && (
            <>
              <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase">
                Set up for this position
              </p>
              {preferred.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </>
          )}
          {members.length > 0 && (
            <>
              <p
                className={`text-muted-foreground px-2 pb-1 text-xs font-semibold tracking-wide uppercase ${
                  preferred.length > 0 ? 'pt-3' : 'pt-2'
                }`}
              >
                {preferred.length > 0 ? 'Other team members' : 'Team members'}
              </p>
              {members.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              <p className="text-muted-foreground px-2 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
                Everyone else
              </p>
              {others.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </>
          )}
          {preferred.length === 0 && members.length === 0 && others.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No matching people.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SchedulingPanel({
  plan,
  canManage,
}: {
  plan: PlanWithType
  canManage: boolean
}) {
  const { data: teams, isPending: teamsPending } = useTeams()
  const { data: positions } = useAllPositions()
  const { data: assignments, isPending: assignmentsPending } = usePlanAssignments(plan.id)
  const deleteAssignment = useDeleteAssignment(plan.id)
  const cancelAssignment = useCancelAssignment(plan.id)
  const sendRequests = useSendRequests(plan.id)
  const [picker, setPicker] = useState<PickerTarget | null>(null)

  // Live scheduling-rules validation (issue #34) — badges update on every edit.
  const validation = usePlanValidation(plan)
  const byPosition = useMemo(() => resultsByPosition(validation.all), [validation])
  const byPerson = useMemo(() => resultsByPerson(validation.all), [validation])

  const planTeams = useMemo(
    () =>
      (teams ?? [])
        .filter((t) => teamServesType(t, plan.service_type_id))
        .sort(
          (a, b) =>
            serviceTypeTeamSort(a, plan.service_type_id) -
            serviceTypeTeamSort(b, plan.service_type_id),
        ),
    [teams, plan.service_type_id],
  )

  const unsentCount = useMemo(
    () =>
      (assignments ?? []).filter((a) => a.status === 'pending' && !a.notified_at)
        .length,
    [assignments],
  )

  function send() {
    sendRequests.mutate(undefined, {
      onSuccess: (result) => {
        if (result.sent > 0) {
          toast.success(
            `${result.sent} request${result.sent === 1 ? '' : 's'} sent`,
          )
        }
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

  // Issue #15 — (re)send the request email to one person from their menu.
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

  // Issue #16 — remove a confirmed person and email them a cancellation.
  function removeAndNotify(assignmentId: string) {
    cancelAssignment.mutate(assignmentId, {
      onSuccess: (result) =>
        toast.success(
          result.notified ? 'Removed · cancellation email sent' : 'Removed',
        ),
      onError: (e) => toast.error(e.message),
    })
  }

  if (planTeams.length === 0 && !teamsPending) {
    if (!canManage) return null
    return (
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            No teams serve this service type yet — create one under Teams to
            start scheduling people.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>People</CardTitle>
            <CardDescription>Who's serving on this plan.</CardDescription>
          </div>
          {canManage && unsentCount > 0 && (
            <Button size="sm" onClick={send} disabled={sendRequests.isPending}>
              {sendRequests.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send {unsentCount} request{unsentCount === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {teamsPending || assignmentsPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          planTeams.map((team) => {
            const teamPositions = (positions ?? []).filter(
              (p) => p.team_id === team.id,
            )
            return (
              <div key={team.id} className="flex flex-col gap-1">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {team.name}
                </h3>
                {teamPositions.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-1 text-sm">
                    No positions in this team yet.
                  </p>
                ) : (
                  teamPositions.map((position) => {
                    const slotAssignments = (assignments ?? []).filter(
                      (a) => a.position_id === position.id,
                    )
                    const posResults = byPosition.get(position.id) ?? []
                    const understaffed = posResults.some(
                      (r) => r.code === 'MANDATORY_UNFILLED',
                    )
                    return (
                      <div
                        key={position.id}
                        className="flex flex-col gap-1 rounded-md border px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium">{position.name}</span>
                            <RuleBadges results={posResults} />
                          </div>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setPicker({ team, position })}
                            >
                              <Plus className="size-3.5" />
                              Add
                            </Button>
                          )}
                        </div>
                        {slotAssignments.length === 0 ? (
                          <p
                            className={
                              understaffed
                                ? 'text-sm font-medium text-red-700 dark:text-red-400'
                                : 'text-muted-foreground text-sm'
                            }
                          >
                            {canManage ? 'Nobody scheduled yet.' : '—'}
                          </p>
                        ) : (
                          slotAssignments.map((assignment) => {
                            const personResults =
                              assignment.status === 'declined'
                                ? []
                                : byPerson.get(assignment.person_id) ?? []
                            return (
                              <div
                                key={assignment.id}
                                className="flex items-center gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">
                                    {fullName(assignment.people)}
                                  </span>
                                  {assignment.status === 'declined' &&
                                    assignment.decline_reason && (
                                      <p className="text-muted-foreground truncate text-xs">
                                        “{assignment.decline_reason}”
                                      </p>
                                    )}
                                  {personResults.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      <RuleBadges results={personResults} />
                                    </div>
                                  )}
                                </div>
                                {assignment.status === 'pending' &&
                                  !assignment.notified_at && (
                                    <Badge variant="outline">Not sent</Badge>
                                  )}
                                <Badge
                                  className={
                                    ASSIGNMENT_STATUS_CLASSES[assignment.status]
                                  }
                                >
                                  {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                                </Badge>
                                {canManage && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        aria-label={`Actions for ${fullName(assignment.people)}`}
                                      >
                                        <MoreHorizontal className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {assignment.status === 'declined' && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            setPicker({
                                              team,
                                              position,
                                              replaceAssignmentId: assignment.id,
                                            })
                                          }
                                        >
                                          <UserPlus className="size-4" />
                                          Find replacement
                                        </DropdownMenuItem>
                                      )}
                                      {assignment.status !== 'declined' &&
                                        assignment.people.email && (
                                          <DropdownMenuItem
                                            onClick={() => sendOne(assignment.id)}
                                          >
                                            <Mail className="size-4" />
                                            Send email
                                          </DropdownMenuItem>
                                        )}
                                      {assignment.status === 'confirmed' ? (
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
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )
          })
        )}
      </CardContent>

      <AssignPersonDialog
        plan={plan}
        target={picker}
        onClose={() => setPicker(null)}
        assignments={assignments ?? []}
      />
    </Card>
  )
}
