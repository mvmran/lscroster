import { Fragment, useMemo } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, GripVertical, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  matchLyricSectionHeader,
  sequenceSteps,
} from '@/features/services/lyric-sections'
import { tintOf } from '@/features/services/section-tints'
import { cn } from '@/lib/utils'

const kindOf = (label: string) => matchLyricSectionHeader(label)?.kind ?? 'unlabeled'

function SequenceChip({
  id,
  label,
  short,
  onRemove,
}: {
  id: string
  label: string
  /** What the chip reads, as the Lyrics Sheet's pills do: "V1", "C×2". */
  short: string
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center rounded-full shadow-xs',
        tintOf(kindOf(label)).chip,
        isDragging && 'z-10 opacity-70 shadow-md',
      )}
    >
      <button
        type="button"
        aria-label={`Drag to move ${label}`}
        title={`Drag to move ${label}`}
        className="shrink-0 cursor-grab touch-none py-1 pl-1.5 opacity-60 hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-2.5" />
      </button>
      <span
        aria-label={label}
        title={label}
        className="px-0.5 text-[11px] leading-4 font-semibold"
      >
        {short}
      </span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        title={`Remove ${label}`}
        className="shrink-0 rounded-full py-1 pr-1.5 pl-0.5 opacity-60 hover:opacity-100"
        onClick={onRemove}
      >
        <X className="size-2.5" />
      </button>
    </div>
  )
}

/**
 * A song's sequence for one plan, as the lyrics editor's pills: drag to
 * reorder, × to drop one, Add to put any of the song's sections on the end
 * (the same one as often as it is sung). Changes stay with the plan item —
 * the song keeps its own — and Use the song's puts that back.
 */
export function PlanSequenceEditor({
  value,
  choices,
  custom,
  onChange,
  onReset,
}: {
  value: string[]
  /** The song's section names, each once (`sequenceChoices`). */
  choices: string[]
  /** True when the plan has its own order rather than the song's. */
  custom: boolean
  onChange: (next: string[]) => void
  onReset: () => void
}) {
  // Ids that survive a reorder: the label and which time it comes round.
  // Two copies of "Chorus" may trade ids in a move, which nobody can see.
  const ids = useMemo(() => {
    const seen = new Map<string, number>()
    return value.map((label) => {
      const n = (seen.get(label) ?? 0) + 1
      seen.set(label, n)
      return `${label}\u0001${n}`
    })
  }, [value])
  // Chips read short ("V1"), as on the Lyrics Sheet; the Add menu stays long,
  // since that is where a section is picked by name.
  const steps = useMemo(() => sequenceSteps(value), [value])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from !== -1 && to !== -1) onChange(arrayMove(value, from, to))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span id="pi-sequence-label" className="text-sm leading-none font-medium">
          Sequence
        </span>
        {custom && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 px-2 text-xs"
            onClick={onReset}
            title="Go back to the sequence saved with the song"
          >
            <RotateCcw className="size-3" />
            Use the song’s
          </Button>
        )}
      </div>
      <div
        role="group"
        aria-labelledby="pi-sequence-label"
        className="flex flex-wrap items-center gap-x-0.5 gap-y-1"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            {value.map((label, index) => (
              <Fragment key={ids[index]}>
                {index > 0 && (
                  <ChevronRight
                    aria-hidden
                    className="text-muted-foreground/60 size-3 shrink-0"
                  />
                )}
                <SequenceChip
                  id={ids[index]}
                  label={label}
                  short={steps[index].short}
                  onRemove={() => onChange(value.filter((_, i) => i !== index))}
                />
              </Fragment>
            ))}
          </SortableContext>
        </DndContext>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Add a section to the sequence"
              title="Add a section to the end"
              className={cn('h-6 rounded-full px-2 text-[11px]', value.length > 0 && 'ml-1')}
            >
              <Plus className="size-3" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {choices.map((label) => (
              <DropdownMenuItem key={label} onSelect={() => onChange([...value, label])}>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    tintOf(kindOf(label)).chip,
                  )}
                >
                  {label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground text-xs">
        {custom
          ? 'This plan’s order — the Lyrics Sheet shows it; the song keeps its own.'
          : 'The song’s order. Rearrange it for this plan only; the Lyrics Sheet shows it.'}
      </p>
    </div>
  )
}
