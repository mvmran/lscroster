import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { fullName } from '@/features/people/person-utils'
import { usePeople } from '@/features/people/use-people'
import {
  useDeleteTeam,
  useMembershipMutations,
  usePositionMutations,
  usePositions,
  useTeam,
  useTeamMembers,
  useUpdateTeam,
} from '@/features/scheduling/use-teams'
import { useServiceTypes } from '@/features/services/use-service-types'

function PositionsCard({
  teamId,
  canManage,
}: {
  teamId: string
  canManage: boolean
}) {
  const { data: positions, isPending } = usePositions(teamId)
  const { create, update, remove } = usePositionMutations(teamId)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

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
            {(positions ?? []).map((position) => (
              <li
                key={position.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                {editing?.id === position.id ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{position.name}</span>
                    {canManage && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setEditing({ id: position.id, name: position.name })}
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
                  </>
                )}
              </li>
            ))}
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
  const { add, setDefaultPosition, remove } = useMembershipMutations()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')

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
          People who can be scheduled onto this team, with their usual
          position.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <ul className="flex flex-col gap-1">
            {(members ?? []).map((member) => (
              <li
                key={member.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <Link
                  to={`/people/${member.person_id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                >
                  {fullName(member.people)}
                </Link>
                {canManage ? (
                  <>
                    <Select
                      value={member.default_position_id ?? 'none'}
                      onValueChange={(v) =>
                        setDefaultPosition.mutate(
                          { id: member.id, positionId: v === 'none' ? null : v },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-40"
                        aria-label={`Default position for ${fullName(member.people)}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default</SelectItem>
                        {(positions ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() =>
                        remove.mutate(member, { onError: (e) => toast.error(e.message) })
                      }
                      aria-label={`Remove ${fullName(member.people)}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  member.default_position_id && (
                    <span className="text-muted-foreground text-sm">
                      {positions?.find((p) => p.id === member.default_position_id)?.name}
                    </span>
                  )
                )}
              </li>
            ))}
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
    </Card>
  )
}

export function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: me } = useCurrentPerson()
  const { data: team, isPending, isError, error } = useTeam(id)
  const { data: serviceTypes } = useServiceTypes()
  const updateTeam = useUpdateTeam()
  const deleteTeam = useDeleteTeam()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('all')

  const canManage = me?.role === 'admin' || me?.role === 'leader'

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

  const typeName = team.service_type_id
    ? (serviceTypes?.find((st) => st.id === team.service_type_id)?.name ?? '')
    : 'All services'

  function openEdit() {
    setName(team!.name)
    setServiceTypeId(team!.service_type_id ?? 'all')
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!name.trim()) return
    try {
      await updateTeam.mutateAsync({
        id: team!.id,
        values: {
          name: name.trim(),
          service_type_id: serviceTypeId === 'all' ? null : serviceTypeId,
        },
      })
      setEditOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
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
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
          <Link to="/teams">
            <ArrowLeft className="size-4" />
            Teams
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{team.name}</h1>
            <p className="text-muted-foreground text-sm">{typeName}</p>
          </div>
          {canManage && (
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

      <PositionsCard teamId={team.id} canManage={canManage} />
      <MembersCard teamId={team.id} canManage={canManage} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
            <DialogDescription>
              Rename the team or change which service type it serves.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="et-name">Name</Label>
              <Input id="et-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="et-type">Service type</Label>
              <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                <SelectTrigger id="et-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All service types</SelectItem>
                  {(serviceTypes ?? []).map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={updateTeam.isPending || !name.trim()}>
              {updateTeam.isPending && <Loader2 className="size-4 animate-spin" />}
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
