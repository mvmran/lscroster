import { useMemo, useState } from 'react'
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
import { addDays, format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  GripVertical,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Music,
  Pencil,
  Plus,
  Printer,
  Trash2,
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
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { useSendPlanNotification } from '@/features/scheduling/use-assignments'
import { SchedulingPanel } from '@/features/scheduling/scheduling-panel'
import { PlanAttachmentsCard, PlanTimesCard } from '@/features/services/plan-extras-cards'
import { PlanItemDialog, type PlanItemDialogState } from '@/features/services/plan-item-dialog'
import {
  computeItemTimes,
  formatClock,
  formatLength,
  formatPlanDate,
  formatTotalLength,
  type PlanItem,
} from '@/features/services/service-utils'
import { SongPickerDialog } from '@/features/services/song-picker-dialog'
import {
  useDeletePlanItem,
  usePlanItems,
  useReorderPlanItems,
} from '@/features/services/use-plan-items'
import {
  useCreatePlan,
  useDeletePlan,
  usePlan,
  useUpdatePlan,
  type PlanWithType,
} from '@/features/services/use-plans'
import { useSaveAsTemplate } from '@/features/services/use-plan-templates'
import { useSongs } from '@/features/services/use-songs'

function offsetLabel(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `+${m}:${s.toString().padStart(2, '0')}`
}

function ItemRow({
  item,
  startsAt,
  offsetSeconds,
  canManage,
  songTitle,
  defaultKey,
  onEdit,
  onDelete,
}: {
  item: PlanItem
  startsAt: Date | null
  offsetSeconds: number
  canManage: boolean
  songTitle?: string
  defaultKey?: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canManage })

  const isHeader = item.kind === 'header'
  const key = item.key_override ?? defaultKey ?? null
  const time = startsAt ? formatClock(startsAt) : offsetLabel(offsetSeconds)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isDragging
          ? 'relative z-10 opacity-80'
          : undefined
      }
    >
      <div
        className={
          isHeader
            ? 'bg-muted/60 flex items-center gap-2 rounded-md px-2 py-2'
            : 'hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-2.5'
        }
      >
        {canManage && (
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-foreground -ml-1 cursor-grab touch-none p-1"
            aria-label={`Reorder ${item.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums sm:w-16 sm:text-sm">
          {time}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {item.kind === 'song' && <Music className="text-muted-foreground size-3.5 shrink-0" />}
            <span
              className={
                isHeader
                  ? 'text-muted-foreground truncate text-xs font-semibold tracking-wide uppercase'
                  : 'truncate font-medium'
              }
            >
              {item.title}
            </span>
            {item.kind === 'song' && key && (
              <Badge variant="secondary" className="shrink-0">
                {key}
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="text-muted-foreground truncate text-xs">{item.description}</p>
          )}
          {item.kind === 'song' && songTitle && songTitle !== item.title && (
            <p className="text-muted-foreground truncate text-xs">{songTitle}</p>
          )}
        </div>
        {!isHeader && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums sm:text-sm">
            {formatLength(item.length_seconds)}
          </span>
        )}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Actions for ${item.title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} variant="destructive">
                <Trash2 className="size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function EditDetailsDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: PlanWithType
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updatePlan = useUpdatePlan()
  const [date, setDate] = useState(plan.date)
  const [title, setTitle] = useState(plan.title ?? '')

  async function save() {
    try {
      await updatePlan.mutateAsync({
        id: plan.id,
        values: { date, title: title.trim() || null },
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit plan details</DialogTitle>
          <DialogDescription>Change the date or title of this plan.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ed-date">Date</Label>
            <Input
              id="ed-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ed-title">Title (optional)</Label>
            <Input
              id="ed-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Easter Sunday"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updatePlan.isPending || !date}>
            {updatePlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DuplicateDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: PlanWithType
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createPlan = useCreatePlan()
  const navigate = useNavigate()
  const [date, setDate] = useState(() =>
    format(addDays(parseISO(plan.date), 7), 'yyyy-MM-dd'),
  )

  async function duplicate() {
    try {
      const copy = await createPlan.mutateAsync({
        service_type_id: plan.service_type_id,
        date,
        title: plan.title,
        source: { kind: 'plan', id: plan.id },
      })
      onOpenChange(false)
      navigate(`/services/plans/${copy.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not duplicate')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate plan</DialogTitle>
          <DialogDescription>
            Copies the whole order of service into a new draft plan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dup-date">Date for the copy</Label>
          <Input
            id="dup-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={duplicate} disabled={createPlan.isPending || !date}>
            {createPlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SaveTemplateDialog({
  plan,
  items,
  open,
  onOpenChange,
}: {
  plan: PlanWithType
  items: PlanItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saveTemplate = useSaveAsTemplate()
  const [name, setName] = useState(`${plan.service_types.name} template`)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await saveTemplate.mutateAsync({
        name: trimmed,
        serviceTypeId: plan.service_type_id,
        items,
      })
      toast.success(`Template “${trimmed}” saved`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save template')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            New plans can start from this template in the "New plan" dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tpl-name">Template name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saveTemplate.isPending || !name.trim()}>
            {saveTemplate.isPending && <Loader2 className="size-4 animate-spin" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NotesCard({ plan, canManage }: { plan: PlanWithType; canManage: boolean }) {
  const updatePlan = useUpdatePlan()
  const [notes, setNotes] = useState(plan.notes ?? '')
  const dirty = notes !== (plan.notes ?? '')

  if (!canManage && !plan.notes) return null

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 px-4">
        <h2 className="text-sm font-semibold">Notes</h2>
        {canManage ? (
          <>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the team should know about this service…"
            />
            {dirty && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={updatePlan.isPending}
                  onClick={() =>
                    updatePlan.mutate(
                      { id: plan.id, values: { notes: notes.trim() || null } },
                      { onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  {updatePlan.isPending && <Loader2 className="size-4 animate-spin" />}
                  Save notes
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{plan.notes}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function PlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: me } = useCurrentPerson()
  const planQuery = usePlan(id)
  const itemsQuery = usePlanItems(id)
  const { data: songs } = useSongs()

  const reorder = useReorderPlanItems(id ?? '')
  const deleteItem = useDeletePlanItem(id ?? '')
  const updatePlan = useUpdatePlan()
  const deletePlan = useDeletePlan()
  const sendNotification = useSendPlanNotification(id ?? '')

  const [itemDialog, setItemDialog] = useState<PlanItemDialogState>(null)
  const [songPickerOpen, setSongPickerOpen] = useState(false)
  const [editDetailsOpen, setEditDetailsOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false)
  const [deletingItem, setDeletingItem] = useState<PlanItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const plan = planQuery.data
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const canManage = me?.role === 'admin' || me?.role === 'leader'

  const songById = useMemo(() => {
    const map = new Map((songs ?? []).map((s) => [s.id, s]))
    return map
  }, [songs])

  const { timed, totalSeconds, endsAt } = useMemo(
    () =>
      computeItemTimes(
        items,
        plan?.date ?? '2000-01-01',
        plan?.service_types.default_start_time ?? null,
      ),
    [items, plan],
  )

  if (planQuery.isError) return <FullPageError message={planQuery.error.message} />
  if (planQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!plan) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
        <CalendarDays className="size-8" />
        <p>This plan doesn’t exist or hasn’t been published yet.</p>
        <Button variant="outline" asChild>
          <Link to="/services">Back to services</Link>
        </Button>
      </div>
    )
  }

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

  function togglePublish() {
    const next = plan!.status === 'published' ? 'draft' : 'published'
    updatePlan.mutate(
      { id: plan!.id, values: { status: next } },
      {
        onSuccess: () => {
          if (next !== 'published') {
            toast.success('Plan moved back to draft')
            return
          }
          // Issue #17 — notify everyone scheduled when the plan goes live.
          toast.success('Plan published')
          sendNotification.mutate(undefined, {
            onSuccess: (res) => {
              if (res.sent > 0) {
                toast.success(
                  `Notified ${res.sent} ${res.sent === 1 ? 'person' : 'people'}`,
                )
              }
              for (const skip of res.skipped) {
                toast.warning(`${skip.name}: ${skip.reason}`)
              }
              if (res.sent === 0 && res.skipped.length === 0) {
                toast.info('No one scheduled to notify')
              }
            },
            onError: (e) =>
              toast.error(`Published, but notifications failed: ${e.message}`),
          })
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  async function confirmDelete() {
    try {
      await deletePlan.mutateAsync(plan!.id)
      toast.success('Plan deleted')
      navigate('/services')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete plan')
    }
  }

  const startTime = plan.service_types.default_start_time
  const startLabel = timed.length > 0 && timed[0].startsAt ? formatClock(timed[0].startsAt) : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
          <Link to="/services">
            <ArrowLeft className="size-4" />
            Services
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{formatPlanDate(plan.date)}</h1>
            <p className="text-muted-foreground text-sm">
              {plan.service_types.name}
              {plan.title ? ` — ${plan.title}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={plan.status === 'published' ? 'default' : 'outline'}>
              {plan.status === 'published' ? 'Published' : 'Draft'}
            </Badge>
            {canManage && (
              <>
                <Button
                  variant={plan.status === 'published' ? 'outline' : 'default'}
                  size="sm"
                  onClick={togglePublish}
                  disabled={updatePlan.isPending || sendNotification.isPending}
                >
                  {sendNotification.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {plan.status === 'published' ? 'Unpublish' : 'Publish'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="size-8" aria-label="Plan actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditDetailsOpen(true)}>
                      <Pencil className="size-4" />
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
                      <Copy className="size-4" />
                      Duplicate…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                      <LayoutTemplate className="size-4" />
                      Save as template…
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/services/plans/${plan.id}/print`}>
                        <Printer className="size-4" />
                        Print run sheet
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setConfirmDeletePlan(true)}
                    >
                      <Trash2 className="size-4" />
                      Delete plan
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {!canManage && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/services/plans/${plan.id}/print`}>
                  <Printer className="size-4" />
                  Print
                </Link>
              </Button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {[
            startLabel ? `Starts ${startLabel}` : null,
            formatTotalLength(totalSeconds),
            endsAt && startTime ? `ends ${formatClock(endsAt)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card className="py-2">
        <CardContent className="px-2">
          {itemsQuery.isPending ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
              <Music className="size-6" />
              {canManage
                ? 'The order of service is empty. Add a header, song or item below.'
                : 'The order of service hasn’t been added yet.'}
            </div>
          ) : (
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
                <div className="flex flex-col">
                  {timed.map(({ item, startsAt, offsetSeconds }) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      startsAt={startsAt}
                      offsetSeconds={offsetSeconds}
                      canManage={canManage}
                      songTitle={item.song_id ? songById.get(item.song_id)?.title : undefined}
                      defaultKey={
                        item.song_id ? songById.get(item.song_id)?.default_key : undefined
                      }
                      onEdit={() => setItemDialog({ mode: 'edit', item })}
                      onDelete={() => setDeletingItem(item)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSongPickerOpen(true)}>
            <Music className="size-4" />
            Add song
          </Button>
          <Button
            variant="outline"
            onClick={() => setItemDialog({ mode: 'create', kind: 'header' })}
          >
            <Plus className="size-4" />
            Add header
          </Button>
          <Button
            variant="outline"
            onClick={() => setItemDialog({ mode: 'create', kind: 'item' })}
          >
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
      )}

      <SchedulingPanel plan={plan} canManage={canManage} />

      <PlanTimesCard planId={plan.id} canManage={canManage} />
      <PlanAttachmentsCard planId={plan.id} canManage={canManage} />

      <NotesCard key={plan.notes ?? ''} plan={plan} canManage={canManage} />

      <PlanItemDialog
        state={itemDialog}
        onClose={() => setItemDialog(null)}
        planId={plan.id}
        itemCount={items.length}
        songs={songs ?? []}
      />
      <SongPickerDialog
        open={songPickerOpen}
        onOpenChange={setSongPickerOpen}
        planId={plan.id}
        itemCount={items.length}
        songs={songs ?? []}
      />
      {editDetailsOpen && (
        <EditDetailsDialog plan={plan} open onOpenChange={setEditDetailsOpen} />
      )}
      {duplicateOpen && (
        <DuplicateDialog plan={plan} open onOpenChange={setDuplicateOpen} />
      )}
      {templateOpen && (
        <SaveTemplateDialog
          plan={plan}
          items={items}
          open
          onOpenChange={setTemplateOpen}
        />
      )}

      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deletingItem?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes it from this plan only{deletingItem?.kind === 'song' ? '; the song stays in the library' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingItem) {
                  deleteItem.mutate(deletingItem.id, {
                    onError: (e) => toast.error(e.message),
                  })
                }
                setDeletingItem(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeletePlan} onOpenChange={setConfirmDeletePlan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the {formatPlanDate(plan.date)} plan and its whole order of
              service. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePlan.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
