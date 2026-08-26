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
  ChevronDown,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Music,
  Pencil,
  Plus,
  Printer,
  Send,
  Trash2,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import {
  useAllPlanMinCounts,
  useRecordPublishOverrides,
} from '@/features/scheduling/use-scheduling-rules'
import { usePlanValidation } from '@/features/scheduling/use-service-state'
import { SchedulingPanel } from '@/features/scheduling/scheduling-panel'
import { PublishGateDialog } from '@/features/services/publish-gate-dialog'
import {
  PlanAttachmentsCard,
  PlanMediaCard,
  PlanTimesCard,
} from '@/features/services/plan-extras-cards'
import { PlanItemDialog, type PlanItemDialogState } from '@/features/services/plan-item-dialog'
import {
  arrangementDisplayTitle,
  buildArrangementIndex,
  comparePlansByDateTime,
  computeItemTimes,
  findClashingPlans,
  formatClock,
  formatLength,
  formatPlanDate,
  formatStartTime,
  formatTotalLength,
  planEffectiveTimes,
  todayISODate,
  type ClashCandidate,
  type PlanItem,
} from '@/features/services/service-utils'
import { PlanClashDialog } from '@/features/services/plan-clash-dialog'
import { SongPickerDialog } from '@/features/services/song-picker-dialog'
import {
  useClearPlanLyricsPins,
  useDeletePlanItem,
  usePinPlanLyrics,
  usePlanItems,
  useReorderPlanItems,
} from '@/features/services/use-plan-items'
import {
  useCreatePlan,
  useDeletePlan,
  usePlan,
  usePlans,
  useUpdatePlan,
  type PlanWithType,
} from '@/features/services/use-plans'
import {
  useDeleteTemplate,
  usePlanTemplates,
  useSaveAsTemplate,
  useUpdateTemplate,
  type PlanTemplate,
} from '@/features/services/use-plan-templates'
import { usePlanTimes } from '@/features/services/use-plan-times'
import { useSongs } from '@/features/services/use-songs'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { invokeFunction } from '@/lib/functions'

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
            title="Drag to move this item up or down"
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
                title="Edit or remove this item"
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
  const { data: plans } = usePlans()
  const [date, setDate] = useState(() =>
    format(addDays(parseISO(plan.date), 7), 'yyyy-MM-dd'),
  )
  // The copy starts at the source plan's effective time; editable here.
  const [startTime, setStartTime] = useState(
    () => planEffectiveTimes(plan).start?.slice(0, 5) ?? '',
  )
  // Existing services the copy's date/time would double up on (issue #78).
  const [clashes, setClashes] = useState<ClashCandidate[]>([])

  // The chosen start as 'HH:mm:ss', with the source plan's end shifted to match.
  const startValue = startTime ? `${startTime}:00` : null

  // Warn before copying onto a date/time that already has a service (issue #78).
  function attemptDuplicate() {
    if (!date) return
    // The copy's effective window: the chosen start, with the service type's
    // end shifted to match (so a retimed copy clashes sensibly).
    const { start, end } = planEffectiveTimes({
      start_time: startValue,
      service_types: plan.service_types,
    })
    const found = findClashingPlans({ date, start, end, excludeId: plan.id }, plans ?? [])
    if (found.length > 0) {
      setClashes(found)
      return
    }
    void duplicate()
  }

  async function duplicate() {
    setClashes([])
    try {
      const copy = await createPlan.mutateAsync({
        service_type_id: plan.service_type_id,
        date,
        title: plan.title,
        start_time: startValue,
        source: { kind: 'plan', id: plan.id },
      })
      onOpenChange(false)
      navigate(`/services/plans/${copy.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not duplicate')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate plan</DialogTitle>
            <DialogDescription>
              Copies the whole order of service into a new draft plan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="dup-start">Start time</Label>
              <Input
                id="dup-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={attemptDuplicate} disabled={createPlan.isPending || !date}>
              {createPlan.isPending && <Loader2 className="size-4 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PlanClashDialog
        clashes={clashes}
        pending={createPlan.isPending}
        onConfirm={duplicate}
        onCancel={() => setClashes([])}
      />
    </>
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
  const { data: allTemplates } = usePlanTemplates()
  const { data: planTimes } = usePlanTimes(plan.id)
  const { data: allMinCounts } = useAllPlanMinCounts()
  const saveTemplate = useSaveAsTemplate()
  const updateTemplate = useUpdateTemplate()
  const deleteTemplate = useDeleteTemplate()
  const [name, setName] = useState(`${plan.service_types.name} template`)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState<PlanTemplate | null>(null)

  // Only this service type's templates can be created from this plan / overwritten.
  const templates = (allTemplates ?? []).filter(
    (t) => t.service_type_id === plan.service_type_id,
  )
  const trimmed = name.trim()
  // Typing an existing template's name (or picking it) switches Save → Update (#61).
  const matching =
    templates.find(
      (t) => t.name.trim().toLowerCase() === trimmed.toLowerCase(),
    ) ?? null
  const pending = saveTemplate.isPending || updateTemplate.isPending

  // Capture the plan's Times alongside its order of service (issue #73).
  const times = (planTimes ?? []).map((t, index) => ({
    label: t.label,
    start_time: t.start_time,
    sort_order: t.sort_order ?? index,
  }))

  // Capture the plan's per-position minimum-required overrides (issue #110).
  const minCounts = (allMinCounts ?? [])
    .filter((m) => m.plan_id === plan.id)
    .map((m) => ({ position_id: m.position_id, min_count: m.min_count }))

  async function save() {
    if (!trimmed) return
    try {
      if (matching) {
        await updateTemplate.mutateAsync({
          id: matching.id,
          name: trimmed,
          startTime: plan.start_time,
          items,
          times,
          minCounts,
        })
        toast.success(`Template “${trimmed}” updated`)
      } else {
        await saveTemplate.mutateAsync({
          name: trimmed,
          serviceTypeId: plan.service_type_id,
          startTime: plan.start_time,
          items,
          times,
          minCounts,
        })
        toast.success(`Template “${trimmed}” saved`)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save template')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteTemplate.mutateAsync(deleting.id)
      toast.success(`Deleted “${deleting.name}”`)
      setDeleting(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete template')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Templates</DialogTitle>
            <DialogDescription>
              Type a new name to create a template, or pick an existing one for
              this service type to overwrite it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-name">Template name</Label>
            <div className="flex gap-2">
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="flex-1"
              />
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={templates.length === 0}
                    aria-label="Choose an existing template"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center gap-1 pr-1">
                      <DropdownMenuItem
                        className="min-w-0 flex-1"
                        onSelect={() => setName(t.name)}
                      >
                        <span className="truncate">{t.name}</span>
                      </DropdownMenuItem>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive shrink-0 rounded p-1"
                        aria-label={`Delete ${t.name}`}
                        onClick={() => {
                          setMenuOpen(false)
                          setDeleting(t)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-muted-foreground text-xs">
              {matching
                ? `Overwrites the existing “${matching.name}” template with this order of service.`
                : 'Creates a new template. New plans can start from it in the “New plan” dialog.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !trimmed}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {matching ? 'Update template' : 'Save template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the template and its saved order of
              service. Plans already created from it are unaffected. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
                  title="Save these notes to the plan"
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

/**
 * The plan's start time on the header subtitle. Managers can override it per
 * plan (e.g. a one-off evening service of a normally-morning service type);
 * leaving it on the service-type default keeps inheriting future changes.
 */
function PlanStartTime({
  plan,
  canManage,
  label,
}: {
  plan: PlanWithType
  canManage: boolean
  label: string | null
}) {
  const updatePlan = useUpdatePlan()
  const [editing, setEditing] = useState(false)
  const effectiveStart = plan.start_time ?? plan.service_types.default_start_time
  const [draft, setDraft] = useState(effectiveStart?.slice(0, 5) ?? '')
  const defaultLabel = formatStartTime(plan.service_types.default_start_time)

  function save(value: string | null) {
    updatePlan.mutate(
      { id: plan.id, values: { start_time: value } },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-28"
          autoFocus
        />
        <Button
          size="sm"
          className="h-7"
          disabled={!draft || updatePlan.isPending}
          onClick={() => save(`${draft}:00`)}
          title="Save this start time for this plan only"
        >
          {updatePlan.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
        {plan.start_time && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={updatePlan.isPending}
            onClick={() => save(null)}
            title={defaultLabel ? `Use the service default (${defaultLabel})` : 'Use the service default'}
          >
            Use default
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => setEditing(false)}
          title="Leave the start time unchanged"
        >
          Cancel
        </Button>
      </span>
    )
  }

  const text = label ? `Starts ${label}` : 'Set start time'
  if (!canManage) return label ? <span>{text}</span> : null

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(effectiveStart?.slice(0, 5) ?? '')
        setEditing(true)
      }}
      className="inline-flex items-center gap-1 rounded hover:text-foreground hover:underline"
      title="Edit the start time for this plan"
    >
      <Clock className="size-3.5" />
      {text}
      {plan.start_time && (
        <span className="text-xs">(custom)</span>
      )}
    </button>
  )
}

export function PlanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // Where "Back" returns to — set via navigation state by the linking page
  // (e.g. the Matrix), otherwise fall back to the main Services page.
  const backTo =
    typeof (location.state as { from?: string } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : '/services'
  const { data: me } = useCurrentPerson()
  const planQuery = usePlan(id)
  const itemsQuery = usePlanItems(id)
  const { data: songs } = useSongs()

  const reorder = useReorderPlanItems(id ?? '')
  const deleteItem = useDeletePlanItem(id ?? '')
  const pinLyrics = usePinPlanLyrics(id ?? '')
  const clearLyricsPins = useClearPlanLyricsPins(id ?? '')
  const updatePlan = useUpdatePlan()
  const deletePlan = useDeletePlan()
  const sendNotification = useSendPlanNotification(id ?? '')
  const recordOverrides = useRecordPublishOverrides(id ?? '')
  const validation = usePlanValidation(planQuery.data ?? undefined)
  const { data: churchSettings } = useChurchSettings()

  const [itemDialog, setItemDialog] = useState<PlanItemDialogState>(null)
  const [songPickerOpen, setSongPickerOpen] = useState(false)
  const [editDetailsOpen, setEditDetailsOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false)
  const [deletingItem, setDeletingItem] = useState<PlanItem | null>(null)
  const [gateOpen, setGateOpen] = useState(false)
  const [confirmSetlist, setConfirmSetlist] = useState(false)
  const [sendingSetlist, setSendingSetlist] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const plan = planQuery.data
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const canManage = me?.role === 'admin' || me?.role === 'leader'

  // arrangement id -> {arrangement, linked songs} — resolves item titles
  // (medleys show every song) and keys since #130.
  const arrangementIndex = useMemo(
    () => buildArrangementIndex(songs ?? []),
    [songs],
  )

  const { timed, totalSeconds, endsAt } = useMemo(
    () =>
      computeItemTimes(
        items,
        plan?.date ?? '2000-01-01',
        plan?.start_time ?? plan?.service_types.default_start_time ?? null,
      ),
    [items, plan],
  )

  // Prev/next/today navigation (issue #69) steps through *every* plan in
  // chronological order, not just this service type's: skipping past the
  // evening service because you opened the morning one is a bug, and the
  // Services list is where filtering by type belongs.
  const plansQuery = usePlans()
  const siblings = useMemo(
    () => [...(plansQuery.data ?? [])].sort(comparePlansByDateTime),
    [plansQuery.data],
  )
  const currentIndex = siblings.findIndex((p) => p.id === plan?.id)
  const prevPlan = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const nextPlan =
    currentIndex >= 0 && currentIndex < siblings.length - 1
      ? siblings[currentIndex + 1]
      : null
  // "Today" jumps to the next upcoming plan (or today's); falls back to the latest.
  const todayPlan = useMemo(() => {
    const today = todayISODate()
    return siblings.find((p) => p.date >= today) ?? siblings[siblings.length - 1] ?? null
  }, [siblings])

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
          <Link to="/services" title="Go back to the services list">
            Back to services
          </Link>
        </Button>
      </div>
    )
  }

  // The order of service is locked once a plan is published (issue #123) — no
  // reordering, adding, editing or deleting items in plan or matrix view.
  const canEditOrder = canManage && plan.status !== 'published'

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

  /**
   * Email the worship set list (issue #133): the send-setlist Edge Function
   * builds the formatted set-list email (songs, keys, links, worship-team
   * roster, lyrics-sheet download link) and batch-sends it to the curated
   * recipient list.
   */
  async function sendSetlist() {
    if (!plan) return
    setSendingSetlist(true)
    try {
      const res = await invokeFunction<{
        ok: boolean
        sent: number
        skipped: { name: string; reason: string }[]
        noRecipients?: boolean
      }>('send-setlist', { planId: plan.id })
      if (res.noRecipients) {
        toast.info(
          'No set-list recipients configured — add them under Settings → Communications setup.',
        )
      } else if (res.sent > 0) {
        toast.success(
          `Set list emailed to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}`,
        )
      }
      for (const skip of res.skipped) {
        toast.warning(`Set list — ${skip.name}: ${skip.reason}`)
      }
    } catch (error) {
      toast.error(
        `Set list failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      setSendingSetlist(false)
    }
  }

  function publishNow() {
    updatePlan.mutate(
      { id: plan!.id, values: { status: 'published' } },
      {
        onSuccess: () => {
          // Issue #17 — notify everyone scheduled when the plan goes live.
          toast.success('Plan published')
          // Lock each song's lyrics to the version being published (#130) so
          // later edits can't rewrite this plan's lyrics sheet.
          pinLyrics.mutate(undefined, {
            onError: (e) =>
              toast.error(`Published, but couldn't lock lyrics versions: ${e.message}`),
          })
          sendNotification.mutate(undefined, {
            // Worship set list to the curated recipient list (issue #133).
            // Chained after the notification send so the two functions'
            // Resend calls never overlap the 2 req/s limit.
            onSettled: () => {
              if (churchSettings?.send_setlist_on_publish) void sendSetlist()
            },
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

  function togglePublish() {
    if (plan!.status === 'published') {
      updatePlan.mutate(
        { id: plan!.id, values: { status: 'draft' } },
        {
          onSuccess: () => {
            toast.success('Plan moved back to draft')
            // Drafts follow the latest lyrics again (#130).
            clearLyricsPins.mutate(undefined, {
              onError: (e) =>
                toast.error(`Couldn't release lyrics versions: ${e.message}`),
            })
          },
          onError: (e) => toast.error(e.message),
        },
      )
      return
    }
    // Publishing: gate on scheduling-rules validation (issue #34). A clean plan
    // publishes straight away; any error or warning opens the two-tier gate.
    if (validation.errors.length === 0 && validation.warnings.length === 0) {
      publishNow()
    } else {
      setGateOpen(true)
    }
  }

  // Record each overridden rule, then publish (issue #34).
  function confirmPublishWithOverrides(reason: string | null) {
    const overrides = [...validation.errors, ...validation.warnings].map((r) => ({
      rule_code: r.code,
      severity: r.severity,
      message: r.message,
      reason,
    }))
    recordOverrides.mutate(overrides, {
      onSuccess: () => {
        setGateOpen(false)
        publishNow()
      },
      onError: (e) => toast.error(e.message),
    })
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

  const startTime = plan.start_time ?? plan.service_types.default_start_time
  // Label the plan's effective start (override or service-type default) — not the
  // first order-of-service item, which is absent while the order is empty. The
  // first item always begins at this same base, so the two agree once items exist.
  const startLabel = startTime ? formatClock(parseISO(`${plan.date}T${startTime}`)) : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link
              to={backTo}
              title={
                backTo === '/services/matrix'
                  ? 'Back to the Matrix'
                  : 'Back to the services list'
              }
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{formatPlanDate(plan.date)}</h1>
            <p className="text-muted-foreground text-sm">
              {plan.service_types.name}
              {plan.title ? ` — ${plan.title}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
          {/* Prev / now / next across this service type's plans (issue #69). */}
          <div className="flex items-center gap-1">
            <span
              className="inline-flex"
              title={!prevPlan ? 'This is the earliest service' : undefined}
            >
              <Button
                variant="outline"
                size="sm"
                className="border-muted-foreground/40"
                disabled={!prevPlan}
                onClick={() => prevPlan && navigate(`/services/plans/${prevPlan.id}`)}
                aria-label="Previous service"
                title="Open the service before this one"
              >
                <ChevronLeft />
                <span className="hidden sm:inline">Prev</span>
              </Button>
            </span>
            <span
              className="inline-flex"
              title={
                !todayPlan || todayPlan.id === plan.id
                  ? 'You are already on the next upcoming service'
                  : undefined
              }
            >
              <Button
                variant="outline"
                size="sm"
                className="border-muted-foreground/40"
                disabled={!todayPlan || todayPlan.id === plan.id}
                onClick={() => todayPlan && navigate(`/services/plans/${todayPlan.id}`)}
                aria-label="Go to the next upcoming service"
                title="Jump to today or the next upcoming service"
              >
                Now
              </Button>
            </span>
            <span
              className="inline-flex"
              title={!nextPlan ? 'This is the latest service' : undefined}
            >
              <Button
                variant="outline"
                size="sm"
                className="border-muted-foreground/40"
                disabled={!nextPlan}
                onClick={() => nextPlan && navigate(`/services/plans/${nextPlan.id}`)}
                aria-label="Next service"
                title="Open the service after this one"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight />
              </Button>
            </span>
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
                  disabled={
                    updatePlan.isPending ||
                    sendNotification.isPending ||
                    recordOverrides.isPending
                  }
                  title={
                    plan.status === 'published'
                      ? 'Hide this plan from the team again'
                      : 'Make it visible and email everyone scheduled'
                  }
                >
                  {sendNotification.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {plan.status === 'published' ? 'Unpublish' : 'Publish'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      aria-label="Plan actions"
                      title="Edit, duplicate, print or delete this plan"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setEditDetailsOpen(true)}
                      title="Change this plan's date or title"
                    >
                      <Pencil className="size-4" />
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDuplicateOpen(true)}
                      title="Copy this order of service to another date"
                    >
                      <Copy className="size-4" />
                      Duplicate…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setTemplateOpen(true)}
                      title="Save this plan as a reusable template, or edit one"
                    >
                      <LayoutTemplate className="size-4" />
                      Templates…
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        to={`/services/plans/${plan.id}/print`}
                        title="Open a printable run sheet"
                      >
                        <Printer className="size-4" />
                        Print run sheet
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={sendingSetlist}
                      onClick={() => setConfirmSetlist(true)}
                      title="Emails the songs, keys and worship roster"
                    >
                      {sendingSetlist ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Email set list…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setConfirmDeletePlan(true)}
                      title="Delete this plan and everyone scheduled on it"
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
                <Link
                  to={`/services/plans/${plan.id}/print`}
                  title="Open a printable run sheet"
                >
                  <Printer className="size-4" />
                  Print
                </Link>
              </Button>
            )}
          </div>
          </div>
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 text-sm">
          <PlanStartTime plan={plan} canManage={canManage} label={startLabel} />
          <span>
            {[
              startLabel ? '·' : null,
              formatTotalLength(totalSeconds),
              endsAt && startTime ? `· ends ${formatClock(endsAt)}` : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </span>
        </div>
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
              {canEditOrder
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
                  {timed.map(({ item, startsAt, offsetSeconds }) => {
                    const info = item.arrangement_id
                      ? arrangementIndex.get(item.arrangement_id)
                      : undefined
                    return (
                      <ItemRow
                        key={item.id}
                        item={item}
                        startsAt={startsAt}
                        offsetSeconds={offsetSeconds}
                        canManage={canEditOrder}
                        songTitle={info ? arrangementDisplayTitle(info) : undefined}
                        defaultKey={info?.arrangement.song_key}
                        onEdit={() => setItemDialog({ mode: 'edit', item })}
                        onDelete={() => setDeletingItem(item)}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {canEditOrder && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setSongPickerOpen(true)}
            title="Add a song from the library to this plan"
          >
            <Music className="size-4" />
            Add song
          </Button>
          <Button
            variant="outline"
            onClick={() => setItemDialog({ mode: 'create', kind: 'header' })}
            title="Add a section heading, like Worship"
          >
            <Plus className="size-4" />
            Add header
          </Button>
          <Button
            variant="outline"
            onClick={() => setItemDialog({ mode: 'create', kind: 'item' })}
            title="Add a non-song item, like Welcome"
          >
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
      )}

      <SchedulingPanel plan={plan} />

      <PlanTimesCard planId={plan.id} canManage={canManage} />
      <PlanMediaCard
        planId={plan.id}
        canManage={canManage}
        serviceName={plan.service_types.name}
        planDate={plan.date}
      />
      <PlanAttachmentsCard planId={plan.id} canManage={canManage} />

      <NotesCard key={plan.notes ?? ''} plan={plan} canManage={canManage} />

      <PlanItemDialog
        state={itemDialog}
        onClose={() => setItemDialog(null)}
        planId={plan.id}
        itemCount={items.length}
        arrangements={arrangementIndex}
      />
      <SongPickerDialog
        open={songPickerOpen}
        onOpenChange={setSongPickerOpen}
        planId={plan.id}
        itemCount={items.length}
        songs={songs ?? []}
      />
      <PublishGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        errors={validation.errors}
        warnings={validation.warnings}
        isPending={recordOverrides.isPending || updatePlan.isPending}
        onConfirm={confirmPublishWithOverrides}
      />

      <AlertDialog open={confirmSetlist} onOpenChange={setConfirmSetlist}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email the worship set list?</AlertDialogTitle>
            <AlertDialogDescription>
              Emails this plan's set list — songs, keys, links and who's
              serving — to the recipients configured under Settings →
              Communications setup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSetlist(false)
                void sendSetlist()
              }}
            >
              Send set list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
