import { useState } from 'react'
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
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** The minimal team shape the reorder list needs. */
export interface OrderableTeam {
  id: string
  name: string
}

/** One reorderable row: drag handle (desktop mouse / keyboard) + up/down arrows. */
function SortableTeamRow({
  team,
  index,
  count,
  onMove,
}: {
  team: OrderableTeam
  index: number
  count: number
  onMove: (index: number, direction: -1 | 1) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-card px-2 py-2 ${
        isDragging ? 'relative z-10 opacity-80 shadow-sm' : ''
      }`}
    >
      <button
        type="button"
        className="text-muted-foreground/60 hover:text-foreground -ml-1 cursor-grab touch-none p-1"
        aria-label={`Drag ${team.name} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        onClick={() => onMove(index, -1)}
        aria-label={`Move ${team.name} up`}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={index === count - 1}
        onClick={() => onMove(index, 1)}
        aria-label={`Move ${team.name} down`}
      >
        <ArrowDown className="size-4" />
      </Button>
    </li>
  )
}

/**
 * Reorder the Matrix team sections for the "All service types" view (issue #33).
 * Drag-and-drop on desktop via dnd-kit (issue #49), with up/down arrows kept as a
 * touch-friendly + keyboard-accessible fallback — mirrors the order-of-service
 * reorder in plan-page. Works on local state until Save, then hands the ordered
 * ids back to the caller (which persists them per-login in localStorage).
 *
 * Rendered only while open (like AssignPersonDialog), so `items` initialises
 * from the current effective order on each fresh mount — no reset effect needed.
 */
export function MatrixTeamOrderDialog({
  onOpenChange,
  teams,
  onSave,
}: {
  onOpenChange: (open: boolean) => void
  teams: OrderableTeam[]
  onSave: (orderedIds: string[]) => void
}) {
  const [items, setItems] = useState<OrderableTeam[]>(teams)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function move(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      return arrayMove(prev, index, target)
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id)
      const newIndex = prev.findIndex((t) => t.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function save() {
    onSave(items.map((t) => t.id))
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reorder teams</DialogTitle>
          <DialogDescription>
            Drag the handle (or use the arrows) to set the order teams appear in
            your Matrix. This is saved on this device for your login only and
            doesn’t affect anyone else.
          </DialogDescription>
        </DialogHeader>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1.5">
              {items.map((team, index) => (
                <SortableTeamRow
                  key={team.id}
                  team={team}
                  index={index}
                  count={items.length}
                  onMove={move}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
