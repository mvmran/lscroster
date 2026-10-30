import { useState } from 'react'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { cn, plural } from '@/lib/utils'
import { GRIP_CLASS, useReorderSensors, useRowDrag } from '@/lib/reorder'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useTeams } from '@/features/scheduling/use-teams'
import {
  DAY_LABELS,
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  serviceTypeSummary,
  type ServiceFrequency,
  type ServiceType,
} from '@/features/services/service-utils'
import {
  useDeleteServiceType,
  useReorderServiceTypes,
  useServiceTypeDeleteImpact,
  useServiceTypes,
  useServiceTypeTeamIds,
  useSaveServiceType,
} from '@/features/services/use-service-types'

/**
 * One reorderable required-team row: drag handle (desktop mouse / keyboard) +
 * up/down arrows (touch fallback) + remove, mirroring the Matrix reorder dialog
 * (#33/#49). Order is local until the service type is saved (#31/#50).
 */
function SortableRequiredTeam({
  id,
  name,
  index,
  count,
  onMove,
  onRemove,
}: {
  id: string
  name: string
  index: number
  count: number
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const drag = useRowDrag(listeners)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...drag.row}
      className={cn(
        'bg-card flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm',
        drag.rowClassName,
        isDragging && 'relative z-10 opacity-80 shadow-sm',
      )}
    >
      <button
        type="button"
        className={cn(
          'text-muted-foreground/60 hover:text-foreground -ml-1 p-1',
          GRIP_CLASS,
        )}
        aria-label={`Drag ${name} to reorder`}
        title="Drag to reorder"
        {...attributes}
        {...drag.grip}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={index === 0}
        onClick={() => onMove(index, -1)}
        aria-label={`Move ${name} up`}
        title={`Move ${name} up`}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={index === count - 1}
        onClick={() => onMove(index, 1)}
        aria-label={`Move ${name} down`}
        title={`Move ${name} down`}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
      >
        <X className="size-4" />
      </Button>
    </li>
  )
}

/** One reorderable service-type card on the index: drag handle + arrows (#51). */
function SortableServiceTypeCard({
  st,
  index,
  count,
  reordering,
  onMove,
  onEdit,
  onDelete,
}: {
  st: ServiceType
  index: number
  count: number
  reordering: boolean
  onMove: (index: number, direction: -1 | 1) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: st.id })
  // With a mouse the whole card moves and a double-click edits it; a finger
  // keeps to the grip (a long-press) and the pen.
  const drag = useRowDrag(listeners, { onEdit })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : undefined}
    >
      <Card
        {...drag.row}
        className={cn('py-3', drag.rowClassName, isDragging && 'shadow-md')}
      >
        <CardContent className="flex items-center gap-1 px-4">
        <button
          type="button"
          className={cn(
            'text-muted-foreground/60 hover:text-foreground -ml-1 p-1',
            GRIP_CLASS,
          )}
          aria-label={`Drag ${st.name} to reorder`}
          title="Drag to reorder"
          {...attributes}
          {...drag.grip}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{st.name}</p>
          <p className="text-muted-foreground truncate text-sm">
            {serviceTypeSummary(st)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={index === 0 || reordering}
          onClick={() => onMove(index, -1)}
          aria-label={`Move ${st.name} up`}
          title={`Move ${st.name} up`}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={index === count - 1 || reordering}
          onClick={() => onMove(index, 1)}
          aria-label={`Move ${st.name} down`}
          title={`Move ${st.name} down`}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Edit ${st.name}`}
          title={`Edit ${st.name}`}
        >
          <Pencil className="size-4" />
        </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Delete ${st.name}`}
            title={`Delete ${st.name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ServiceTypeDialog({
  serviceType,
  open,
  onOpenChange,
}: {
  serviceType: ServiceType | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saveType = useSaveServiceType()
  const { data: teams } = useTeams()
  const teamIdsQuery = useServiceTypeTeamIds(serviceType?.id)

  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [frequency, setFrequency] = useState<ServiceFrequency | ''>('')
  const [days, setDays] = useState<number[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])

  // Seed the fields each time the dialog opens for a different target
  // (set-state-during-render, mirroring the app's other dialogs).
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const target = serviceType?.id ?? 'new'
  if (open && seededFor !== target) {
    setSeededFor(target)
    setName(serviceType?.name ?? '')
    setStartTime(serviceType?.default_start_time?.slice(0, 5) ?? '')
    setEndTime(serviceType?.end_time?.slice(0, 5) ?? '')
    setFrequency(serviceType?.frequency ?? '')
    setDays(serviceType?.days_of_week ?? [])
    setTeamIds([])
  }
  if (!open && seededFor !== null) setSeededFor(null)

  // Required teams arrive asynchronously; seed them once loaded for the target.
  const [teamsSeededFor, setTeamsSeededFor] = useState<string | null>(null)
  if (open && serviceType && teamIdsQuery.data && teamsSeededFor !== serviceType.id) {
    setTeamsSeededFor(serviceType.id)
    setTeamIds(teamIdsQuery.data)
  }
  if (!open && teamsSeededFor !== null) setTeamsSeededFor(null)
  // Saving replaces the whole list, so an edit can't save until the list it
  // would replace has loaded — an empty one would unlink every required team.
  const teamsReady = !serviceType || teamsSeededFor === serviceType.id

  const pending = saveType.isPending

  function toggleDay(day: number) {
    setDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    )
  }

  function toggleTeam(id: string) {
    setTeamIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  const sensors = useReorderSensors()

  // Reorder the required teams (#31 arrows, #50 drag) — persisted on save.
  function moveTeam(index: number, direction: -1 | 1) {
    setTeamIds((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      return arrayMove(prev, index, target)
    })
  }

  function handleTeamDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setTeamIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const availableTeams = (teams ?? []).filter((t) => !teamIds.includes(t.id))

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || !teamsReady) return
    const values = {
      name: trimmed,
      default_start_time: startTime ? `${startTime}:00` : null,
      end_time: endTime ? `${endTime}:00` : null,
      frequency: frequency || null,
      days_of_week: days,
    }
    try {
      // The type and its teams in one call: all of it saves, or none does.
      await saveType.mutateAsync({ id: serviceType?.id, values, teamIds })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {serviceType ? 'Edit service type' : 'New service type'}
          </DialogTitle>
          <DialogDescription>
            Describe when this gathering runs and which teams it needs.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <Label htmlFor="st-name">Name</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunday 10am"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="st-frequency">Frequency</Label>
            <Select
              value={frequency || 'none'}
              onValueChange={(v) =>
                setFrequency(v === 'none' ? '' : (v as ServiceFrequency))
              }
            >
              <SelectTrigger id="st-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {FREQUENCY_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Day of week</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, index) => {
                const on = days.includes(index)
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={on ? 'default' : 'outline'}
                    className="h-8 w-12"
                    aria-pressed={on}
                    onClick={() => toggleDay(index)}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="st-start">Start time</Label>
                <Input
                  id="st-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="st-end">End time</Label>
                <Input
                  id="st-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-36"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Start time drives the running clock on the order of service.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Teams required</Label>
            {!teamsReady ? (
              <p className="text-muted-foreground rounded-md border p-3 text-sm">
                {teamIdsQuery.isError
                  ? `Couldn’t load this service type’s teams (${teamIdsQuery.error.message}). Close and try again.`
                  : 'Loading teams…'}
              </p>
            ) : !teams || teams.length === 0 ? (
              <p className="text-muted-foreground rounded-md border p-3 text-sm">
                No teams yet. Create teams first, then add them here.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {teamIds.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    onDragEnd={handleTeamDragEnd}
                  >
                    <SortableContext
                      items={teamIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="flex flex-col gap-1.5">
                        {teamIds.map((id, index) => {
                          const team = teams.find((t) => t.id === id)
                          if (!team) return null
                          return (
                            <SortableRequiredTeam
                              key={id}
                              id={id}
                              name={team.name}
                              index={index}
                              count={teamIds.length}
                              onMove={moveTeam}
                              onRemove={() => toggleTeam(id)}
                            />
                          )
                        })}
                      </ul>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                    No teams added yet. A service type with none shows every
                    team's plans.
                  </p>
                )}
                {availableTeams.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground text-xs">Add a team</p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableTeams.map((team) => (
                        <Button
                          key={team.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => toggleTeam(team.id)}
                        >
                          <Plus className="size-3.5" />
                          {team.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Teams appear on a plan in this order.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !name.trim() || !teamsReady}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {serviceType ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ServiceTypesPage() {
  const { data: serviceTypes, isPending } = useServiceTypes()
  const reorder = useReorderServiceTypes()
  const remove = useDeleteServiceType()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceType | null>(null)
  const [deleting, setDeleting] = useState<ServiceType | null>(null)
  const impact = useServiceTypeDeleteImpact(deleting?.id ?? null)

  const sensors = useReorderSensors()

  function move(index: number, direction: -1 | 1) {
    if (!serviceTypes) return
    const target = index + direction
    if (target < 0 || target >= serviceTypes.length) return
    reorder.mutate(arrayMove(serviceTypes, index, target), {
      onError: (e) => toast.error(e.message),
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !serviceTypes) return
    const oldIndex = serviceTypes.findIndex((st) => st.id === active.id)
    const newIndex = serviceTypes.findIndex((st) => st.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorder.mutate(arrayMove(serviceTypes, oldIndex, newIndex), {
      onError: (e) => toast.error(e.message),
    })
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      const { filesLeft } = await remove.mutateAsync(deleting.id)
      toast.success(`Deleted ${deleting.name}`)
      if (filesLeft > 0) {
        toast.warning(
          `${plural(filesLeft, 'attached file')} couldn’t be removed from storage`,
        )
      }
      setDeleting(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Service types"
        backTo="/settings"
        backLabel="Settings"
        description="Recurring gatherings you plan services for, e.g. “Sunday 10am”."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            Add service type
          </Button>
        }
      />

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : !serviceTypes || serviceTypes.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No service types yet. Add one to start planning services."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={serviceTypes.map((st) => st.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {serviceTypes.map((st, index) => (
                <SortableServiceTypeCard
                  key={st.id}
                  st={st}
                  index={index}
                  count={serviceTypes.length}
                  reordering={reorder.isPending}
                  onMove={move}
                  onEdit={() => {
                    setEditing(st)
                    setDialogOpen(true)
                  }}
                  onDelete={() => setDeleting(st)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ServiceTypeDialog
        serviceType={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? 'this service type'}”?`}
        confirmLabel="Delete service type"
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>This can’t be undone. Along with the service type, LSCroster deletes:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>
              {impact.data ? plural(impact.data.plans, 'plan') : 'every plan'} under it
            </strong>
            {impact.data
              ? ` (${impact.data.upcoming} upcoming, ` +
                `${impact.data.plans - impact.data.upcoming} past)`
              : ''}
            , with their orders of service and times
          </li>
          <li>
            {impact.data
              ? plural(impact.data.assignments, 'plan assignment')
              : 'every plan assignment'}{' '}
            — everyone scheduled on those plans, confirmed or not. Nobody is emailed.
          </li>
          <li>
            {impact.data
              ? plural(impact.data.attachments, 'attachment')
              : 'their attachments'}{' '}
            (the files too)
          </li>
          <li>
            {impact.data ? plural(impact.data.templates, 'template') : 'its templates'}, its
            team links and its conditional rules
          </li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}
