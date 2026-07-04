import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { fullName } from '@/features/people/person-utils'
import { usePeople } from '@/features/people/use-people'
import { PositionLevelPill } from '@/features/scheduling/position-level-pill'
import { ServiceTypePicker } from '@/features/scheduling/service-type-picker'
import { TeamGrantCard } from '@/features/scheduling/team-grants-card'
import { useTeamPermissions } from '@/features/scheduling/use-team-access'
import { otherProficiency, type Position } from '@/features/scheduling/scheduling-utils'
import {
  useDeleteTeam,
  useMembershipMutations,
  usePositionMutations,
  usePositions,
  useSetTeamServiceTypes,
  useTeam,
  useTeamMembers,
  useUpdateTeam,
  type TeamMemberWithPositions,
} from '@/features/scheduling/use-teams'
import { useServiceTypes } from '@/features/services/use-service-types'

/** Names of the people eligible for a position, qualified first then trainees. */
function eligibleSummary(
  members: ReturnType<typeof useTeamMembers>['data'],
  positionId: string,
): { qualified: string[]; trainees: string[] } {
  const qualified: string[] = []
  const trainees: string[] = []
  for (const member of members ?? []) {
    const tp = member.team_member_positions.find((p) => p.position_id === positionId)
    if (!tp) continue
    ;(tp.proficiency === 'trainee' ? trainees : qualified).push(fullName(member.people))
  }
  qualified.sort((a, b) => a.localeCompare(b))
  trainees.sort((a, b) => a.localeCompare(b))
  return { qualified, trainees }
}

/** One-line summary of a position's headcount/level requirements (issue #32). */
function positionReqSummary(p: Position): string {
  const parts: string[] = []
  parts.push(
    p.min_count >= 1
      ? p.min_count === 1
        ? 'Mandatory'
        : `Needs ${p.min_count}`
      : 'Optional',
  )
  if (p.max_count != null) parts.push(`max ${p.max_count}`)
  if (p.requires_level === 'qualified') parts.push('needs a qualified person')
  if (p.fill_priority !== 100) parts.push(`priority ${p.fill_priority}`)
  return parts.join(' · ')
}

function PositionRequirementsDialog({
  position,
  onSave,
  pending,
  onClose,
}: {
  position: Position | null
  onSave: (values: {
    min_count: number
    max_count: number | null
    requires_level: 'qualified' | null
    fill_priority: number
  }) => void
  pending: boolean
  onClose: () => void
}) {
  const [minCount, setMinCount] = useState('0')
  const [maxCount, setMaxCount] = useState('')
  const [needsQualified, setNeedsQualified] = useState(false)
  const [priority, setPriority] = useState('100')

  // Seed when a position opens (set-state-during-render, like other dialogs).
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (position && seededFor !== position.id) {
    setSeededFor(position.id)
    setMinCount(String(position.min_count))
    setMaxCount(position.max_count == null ? '' : String(position.max_count))
    setNeedsQualified(position.requires_level === 'qualified')
    setPriority(String(position.fill_priority))
  }
  if (!position && seededFor !== null) setSeededFor(null)

  function save() {
    const min = Number.parseInt(minCount, 10) || 0
    const max = maxCount.trim() === '' ? null : Number.parseInt(maxCount, 10)
    if (max != null && max < min) {
      toast.error('Maximum must be at least the minimum')
      return
    }
    onSave({
      min_count: min,
      max_count: max,
      requires_level: needsQualified ? 'qualified' : null,
      fill_priority: Number.parseInt(priority, 10) || 100,
    })
  }

  return (
    <Dialog open={!!position} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{position?.name} requirements</DialogTitle>
          <DialogDescription>
            How many people this position needs and the level required. Used by
            roster warnings and auto-scheduling.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pr-min">Minimum needed</Label>
              <Input
                id="pr-min"
                type="number"
                min={0}
                inputMode="numeric"
                value={minCount}
                onChange={(e) => setMinCount(e.target.value)}
                className="w-28"
              />
              <p className="text-muted-foreground text-xs">0 = optional</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pr-max">Maximum</Label>
              <Input
                id="pr-max"
                type="number"
                min={0}
                inputMode="numeric"
                value={maxCount}
                onChange={(e) => setMaxCount(e.target.value)}
                placeholder="No limit"
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pr-priority">Fill priority</Label>
              <Input
                id="pr-priority"
                type="number"
                inputMode="numeric"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-28"
              />
              <p className="text-muted-foreground text-xs">lower = fill first</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={needsQualified} onCheckedChange={setNeedsQualified} />
            Requires a qualified person (not just trainees)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PositionsCard({
  teamId,
  canManage,
}: {
  teamId: string
  canManage: boolean
}) {
  const { data: positions, isPending } = usePositions(teamId)
  const { data: members } = useTeamMembers(teamId)
  const { create, update, remove } = usePositionMutations(teamId)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [reqDialog, setReqDialog] = useState<Position | null>(null)

  function addPosition() {
    const trimmed = newName.trim()
    if (!trimmed) return
    create.mutate(
      { name: trimmed, sort_order: positions?.length ?? 0 },
      {
        onSuccess: () => setNewName(''),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <CardDescription>
          The roles people get scheduled into, e.g. Acoustic guitar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <ul className="flex flex-col gap-1">
            {(positions ?? []).map((position) => {
              const { qualified, trainees } = eligibleSummary(members, position.id)
              const total = qualified.length + trainees.length
              const names = [...qualified, ...trainees.map((n) => `${n} (trainee)`)]
              return (
                <li
                  key={position.id}
                  className="hover:bg-accent/40 flex flex-col gap-0.5 rounded-md px-2 py-1.5"
                >
                  {editing?.id === position.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!editing.name.trim()) return
                          update.mutate(
                            { id: position.id, values: { name: editing.name.trim() } },
                            {
                              onSuccess: () => setEditing(null),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }}
                      >
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {position.name}
                        </span>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setReqDialog(position)}
                              aria-label={`${position.name} requirements`}
                            >
                              <SlidersHorizontal className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() =>
                                setEditing({ id: position.id, name: position.name })
                              }
                              aria-label={`Rename ${position.name}`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() =>
                                remove.mutate(position.id, {
                                  onError: (e) => toast.error(e.message),
                                })
                              }
                              aria-label={`Delete ${position.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {canManage && (
                        <p className="text-muted-foreground text-xs">
                          {positionReqSummary(position)}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {total === 0 ? (
                          'No one set up for this position yet.'
                        ) : (
                          <>
                            <span className="font-medium">{total} eligible</span>
                            {trainees.length > 0 && ` · ${trainees.length} trainee`}
                            {` — ${names.join(', ')}`}
                          </>
                        )}
                      </p>
                    </>
                  )}
                </li>
              )
            })}
            {(positions ?? []).length === 0 && (
              <p className="text-muted-foreground px-2 py-1 text-sm">No positions yet.</p>
            )}
          </ul>
        )}
        {canManage && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addPosition()
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New position name…"
              className="h-9"
            />
            <Button type="submit" variant="outline" disabled={create.isPending || !newName.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>

      <PositionRequirementsDialog
        position={reqDialog}
        pending={update.isPending}
        onClose={() => setReqDialog(null)}
        onSave={(values) =>
          reqDialog &&
          update.mutate(
            { id: reqDialog.id, values },
            {
              onSuccess: () => setReqDialog(null),
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </Card>
  )
}

function MembersCard({
  teamId,
  canManage,
}: {
  teamId: string
  canManage: boolean
}) {
  const { data: members, isPending } = useTeamMembers(teamId)
  const { data: positions } = usePositions(teamId)
  const { data: people } = usePeople()
  const { add, addPosition, removePosition, setProficiency, remove } =
    useMembershipMutations()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [memberToRemove, setMemberToRemove] = useState<TeamMemberWithPositions | null>(
    null,
  )

  const candidates = useMemo(() => {
    const memberIds = new Set((members ?? []).map((m) => m.person_id))
    const term = search.trim().toLowerCase()
    return (people ?? [])
      .filter((p) => p.status === 'active' && !memberIds.has(p.id))
      .filter((p) => term === '' || fullName(p).toLowerCase().includes(term))
  }, [people, members, search])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          People who can be scheduled onto this team, and the positions they
          can fill.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <ul className="flex flex-col gap-1">
            {(members ?? []).map((member) => {
              const selectedIds = new Set(
                member.team_member_positions.map((tp) => tp.position_id),
              )
              const memberPositions = [...member.team_member_positions].sort((a, b) =>
                a.positions.name.localeCompare(b.positions.name),
              )
              return (
                <li
                  key={member.id}
                  className="hover:bg-accent/40 flex flex-col gap-1 rounded-md px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/people/${member.person_id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                    >
                      {fullName(member.people)}
                    </Link>
                    {canManage && (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 justify-between gap-1 font-normal"
                              aria-label={`Positions for ${fullName(member.people)}`}
                            >
                              Positions
                              <ChevronDown className="size-4 shrink-0 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(positions ?? []).length === 0 ? (
                              <DropdownMenuItem disabled>
                                Add a position first
                              </DropdownMenuItem>
                            ) : (
                              (positions ?? []).map((p) => (
                                <DropdownMenuCheckboxItem
                                  key={p.id}
                                  checked={selectedIds.has(p.id)}
                                  onSelect={(e) => e.preventDefault()}
                                  onCheckedChange={(checked) =>
                                    (checked ? addPosition : removePosition).mutate(
                                      { member, positionId: p.id },
                                      { onError: (e) => toast.error(e.message) },
                                    )
                                  }
                                >
                                  {p.name}
                                </DropdownMenuCheckboxItem>
                              ))
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setMemberToRemove(member)}
                          aria-label={`Remove ${fullName(member.people)}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {memberPositions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {memberPositions.map((tp) => (
                        <PositionLevelPill
                          key={tp.position_id}
                          name={tp.positions.name}
                          proficiency={tp.proficiency}
                          canManage={canManage}
                          disabled={setProficiency.isPending}
                          onToggle={() =>
                            setProficiency.mutate(
                              {
                                member,
                                positionId: tp.position_id,
                                proficiency: otherProficiency(tp.proficiency),
                              },
                              { onError: (e) => toast.error(e.message) },
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
            {(members ?? []).length === 0 && (
              <p className="text-muted-foreground px-2 py-1 text-sm">No members yet.</p>
            )}
          </ul>
        )}
        {canManage && (
          <div>
            <Button variant="outline" onClick={() => setPickerOpen(true)}>
              <UserPlus className="size-4" />
              Add member
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>Pick someone from the directory.</DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            autoFocus
          />
          <div className="-mx-2 flex-1 overflow-y-auto px-2">
            {candidates.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No matching people.
              </p>
            ) : (
              <ul className="flex flex-col">
                {candidates.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={add.isPending}
                      onClick={() =>
                        add.mutate(
                          { team_id: teamId, person_id: person.id },
                          {
                            onSuccess: () => setPickerOpen(false),
                            onError: (e) => toast.error(e.message),
                          },
                        )
                      }
                      className="hover:bg-accent w-full rounded-md px-2 py-2 text-left text-sm disabled:opacity-50"
                    >
                      {fullName(person)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm before removing a member from the team (issue #66). */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {memberToRemove ? fullName(memberToRemove.people) : 'this member'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll be taken off this team and its positions. Existing
              assignments on published plans aren't changed. You can add them
              back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!memberToRemove) return
                remove.mutate(memberToRemove, {
                  onError: (e) => toast.error(e.message),
                })
                setMemberToRemove(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const perms = useTeamPermissions()
  const { data: team, isPending, isError, error } = useTeam(id)
  const { data: serviceTypes } = useServiceTypes()
  const updateTeam = useUpdateTeam()
  const setTeamServiceTypes = useSetTeamServiceTypes()
  const deleteTeam = useDeleteTeam()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState('')
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([])

  // Governance (admins + global leaders) edit the team and appoint grants;
  // content management (positions, members) is scoped to this team's leaders.
  const canGovern = perms.canGovern
  const savingEdit = updateTeam.isPending || setTeamServiceTypes.isPending

  if (isError) return <FullPageError message={error.message} />
  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (!team) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
        <UsersRound className="size-8" />
        <p>This team doesn't exist.</p>
        <Button variant="outline" asChild>
          <Link to="/teams">Back to teams</Link>
        </Button>
      </div>
    )
  }

  const typeNames = team.service_type_teams
    .map((st) => serviceTypes?.find((s) => s.id === st.service_type_id)?.name)
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b))
  const typeName =
    team.service_type_teams.length === 0
      ? 'All services'
      : typeNames.join(', ') || 'All services'
  const canManageContent = perms.canManageTeam(team.id)

  function openEdit() {
    setName(team!.name)
    setServiceTypeIds(team!.service_type_teams.map((st) => st.service_type_id))
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!name.trim()) return
    try {
      await updateTeam.mutateAsync({
        id: team!.id,
        values: { name: name.trim() },
      })
      await setTeamServiceTypes.mutateAsync({ teamId: team!.id, serviceTypeIds })
      setEditOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
  }

  function toggleType(id: string) {
    setServiceTypeIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  async function confirmDeleteTeam() {
    try {
      await deleteTeam.mutateAsync(team!.id)
      toast.success('Team deleted')
      navigate('/teams')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate('/teams')
          }
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{team.name}</h1>
            <p className="text-muted-foreground text-sm">{typeName}</p>
          </div>
          {canGovern && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      <PositionsCard teamId={team.id} canManage={canManageContent} />
      <MembersCard teamId={team.id} canManage={canManageContent} />
      <TeamGrantCard teamId={team.id} kind="leader" canManage={canGovern} />
      <TeamGrantCard teamId={team.id} kind="viewer" canManage={canGovern} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
            <DialogDescription>
              Rename the team or change which service types it serves.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="et-name">Name</Label>
              <Input id="et-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Service types</Label>
              <ServiceTypePicker
                serviceTypes={serviceTypes}
                selectedIds={serviceTypeIds}
                onToggle={toggleType}
              />
              <p className="text-muted-foreground text-xs">
                Leave all unticked and the team appears on every service type's
                plans.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit || !name.trim()}>
              {savingEdit && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {team.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the team, its positions, its membership list and every
              scheduling assignment that used it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTeam}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTeam.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
