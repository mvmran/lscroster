import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarX,
  Loader2,
  Mail,
  Minus,
  MoreHorizontal,
  Plus,
  Repeat,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react'
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
import { useTeamPermissions } from '@/features/scheduling/use-team-access'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  serviceTypeTeamSort,
  teamServesType,
  useAllPositions,
  useAllTeamMembers,
  useTeams,
  useUpdatePositionMinCount,
} from '@/features/scheduling/use-teams'
import {
  resultsByPerson,
  resultsByPosition,
  usePlanValidation,
} from '@/features/scheduling/use-service-state'
import { SuggestRosterButton } from '@/features/scheduling/auto-schedule-dialog'
import { useAutoScheduler } from '@/features/scheduling/use-auto-scheduler'
import { ReplaceDialog, type ReplaceTarget } from '@/features/scheduling/replace-dialog'
import { RuleBadges } from '@/features/scheduling/validation-badges'
import { planEffectiveTimes } from '@/features/services/service-utils'
import type { PlanWithType } from '@/features/services/use-plans'

export interface PickerTarget {
  team: Team
  position: Position
  /** When replacing an existing assignment. */
  replaceAssignmentId?: string
  /** The replaced person was already emailed — notify them on removal (#85). */
  replaceWasNotified?: boolean
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
  const { rank } = useAutoScheduler(plan)
  const [search, setSearch] = useState('')

  const pending = createAssignment.isPending || replaceAssignment.isPending

  // The single best candidate for this slot per the auto-scheduler (issue #108).
  // Highlighted with a green "Suggested roster" badge on exactly one person.
  const suggestedPersonId = useMemo(() => {
    if (!target) return null
    const exclude = target.replaceAssignmentId
      ? assignments
          .filter((a) => a.id === target.replaceAssignmentId)
          .map((a) => a.person_id)
      : []
    return rank(target.position.id, exclude)[0]?.personId ?? null
  }, [target, assignments, rank])

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
    // Each plan's own start-time override is honoured via planEffectiveTimes.
    const here = planEffectiveTimes(plan)
    const elsewhere = (onDate ?? []).filter((a) => {
      if (
        a.person_id !== personId ||
        a.status === 'declined' ||
        a.id === target?.replaceAssignmentId
      ) {
        return false
      }
      if (a.plan_id === plan.id) return true
      const there = planEffectiveTimes({
        start_time: a.plans?.start_time ?? null,
        service_types: {
          default_start_time: a.plans?.service_types?.default_start_time ?? null,
          end_time: a.plans?.service_types?.end_time ?? null,
        },
      })
      return timesOverlap(here.start, here.end, there.start, there.end)
    })
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
        {
          oldAssignmentId: target.replaceAssignmentId,
          values,
          notifyOld: target.replaceWasNotified,
        },
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
        {person.id === suggestedPersonId && (
          <Badge
            variant="outline"
            className="shrink-0 border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
          >
            <Sparkles className="size-3" />
            Suggested roster
          </Badge>
        )}
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

/**
 * Inline minimum-required stepper beside a position on the plan (issue #71).
 * Edits the position's global `min_count`; the optimistic cache update makes the
 * value and the understaffed badge respond immediately. min_count 0 = optional.
 */
function PositionMinCount({ position }: { position: Position }) {
  const update = useUpdatePositionMinCount()
  const value = position.min_count

  function set(next: number) {
    if (next < 0 || next > 99 || next === value) return
    update.mutate(
      { id: position.id, min_count: next },
      { onError: (e) => toast.error(e.message) },
    )
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border px-1.5 py-0.5"
      title="Minimum people required for this position"
    >
      <span className="text-muted-foreground mr-0.5 text-xs">Min</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={value <= 0 || update.isPending}
        onClick={() => set(value - 1)}
        aria-label={`Decrease minimum for ${position.name}`}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-4 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={update.isPending}
        onClick={() => set(value + 1)}
        aria-label={`Increase minimum for ${position.name}`}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

export function SchedulingPanel({ plan }: { plan: PlanWithType }) {
  const { data: teams, isPending: teamsPending } = useTeams()
  const { data: positions } = useAllPositions()
  const { data: assignments, isPending: assignmentsPending } = usePlanAssignments(plan.id)
  const perms = useTeamPermissions()
  const { data: me } = useCurrentPerson()
  const deleteAssignment = useDeleteAssignment(plan.id)
  const cancelAssignment = useCancelAssignment(plan.id)
  const sendRequests = useSendRequests(plan.id)
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null)

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

  const { canManageTeam, canViewTeam, isAdmin } = perms

  // Teams on this plan the signed-in person may manage (admin or Team Leader).
  const manageablePlanTeamIds = useMemo(
    () => new Set(planTeams.filter((t) => canManageTeam(t.id)).map((t) => t.id)),
    [planTeams, canManageTeam],
  )
  const manageAny = manageablePlanTeamIds.size > 0

  // Teams whose blocks render at all: managed, on a published plan (everyone),
  // viewed (read-only Team Viewers), or the member's own assigned team on a draft.
  const assignedTeamIds = useMemo(
    () =>
      new Set(
        (assignments ?? [])
          .filter((a) => a.person_id === me?.id)
          .map((a) => a.team_id),
      ),
    [assignments, me?.id],
  )
  const visibleTeams = useMemo(
    () =>
      planTeams.filter(
        (t) =>
          canManageTeam(t.id) ||
          plan.status === 'published' ||
          canViewTeam(t.id) ||
          assignedTeamIds.has(t.id),
      ),
    [planTeams, canManageTeam, canViewTeam, plan.status, assignedTeamIds],
  )

  // Suggest-roster covers only the teams this person manages (auto-fills theirs).
  const excludeTeamIds = useMemo(
    () => (isAdmin ? [] : planTeams.filter((t) => !canManageTeam(t.id)).map((t) => t.id)),
    [isAdmin, planTeams, canManageTeam],
  )

  const unsentAssignments = useMemo(
    () =>
      (assignments ?? []).filter(
        (a) =>
          a.status === 'pending' &&
          !a.notified_at &&
          manageablePlanTeamIds.has(a.team_id),
      ),
    [assignments, manageablePlanTeamIds],
  )
  const unsentCount = unsentAssignments.length

  function send() {
    const ids = unsentAssignments.map((a) => a.id)
    if (ids.length === 0) return
    sendRequests.mutate(ids, {
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

  // Cancel every assignment whose request email hasn't gone out yet — no email
  // is sent since the person was never notified, so we just delete the rows.
  function cancelUnsent() {
    if (unsentAssignments.length === 0) return
    Promise.allSettled(
      unsentAssignments.map((a) => deleteAssignment.mutateAsync(a.id)),
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
    if (!manageAny) return null
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
          {manageAny && (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <SuggestRosterButton plan={plan} excludeTeamIds={excludeTeamIds} />
                {unsentCount > 0 && (
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
              {unsentCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelUnsent}
                  disabled={deleteAssignment.isPending}
                >
                  {deleteAssignment.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Cancel unsent
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {teamsPending || assignmentsPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          visibleTeams.map((team) => {
            const teamManage = canManageTeam(team.id)
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
                          {teamManage && (
                            <div className="flex items-center gap-1">
                              <PositionMinCount position={position} />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setPicker({ team, position })}
                              >
                                <Plus className="size-3.5" />
                                Add
                              </Button>
                            </div>
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
                            {teamManage ? 'Nobody scheduled yet.' : '—'}
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
                                  <Link
                                    to={`/people/${assignment.person_id}`}
                                    className="block truncate text-sm hover:underline"
                                  >
                                    {fullName(assignment.people)}
                                  </Link>
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
                                {teamManage && (
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
                                            setReplaceTarget({
                                              assignmentId: assignment.id,
                                              personId: assignment.person_id,
                                              personName: fullName(assignment.people),
                                              team,
                                              position,
                                              declined: true,
                                              declineReason: assignment.decline_reason,
                                            })
                                          }
                                        >
                                          <UserPlus className="size-4" />
                                          Find replacement
                                        </DropdownMenuItem>
                                      )}
                                      {/* Replace only while pending — a confirmed
                                          person should be removed-and-notified,
                                          not silently swapped (issue #85). */}
                                      {assignment.status === 'pending' && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            setReplaceTarget({
                                              assignmentId: assignment.id,
                                              personId: assignment.person_id,
                                              personName: fullName(assignment.people),
                                              team,
                                              position,
                                              wasNotified: !!assignment.notified_at,
                                            })
                                          }
                                        >
                                          <Repeat className="size-4" />
                                          Replace…
                                        </DropdownMenuItem>
                                      )}
                                      {assignment.status === 'pending' &&
                                        (assignment.people.email ||
                                          assignment.people.managed_by_person_id) && (
                                          <DropdownMenuItem
                                            onClick={() => sendOne(assignment.id)}
                                          >
                                            <Mail className="size-4" />
                                            Send email
                                          </DropdownMenuItem>
                                        )}
                                      {assignment.status === 'confirmed' ||
                                      (assignment.status === 'pending' &&
                                        assignment.notified_at) ? (
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

      <ReplaceDialog
        plan={plan}
        target={replaceTarget}
        onClose={() => setReplaceTarget(null)}
      />
    </Card>
  )
}
