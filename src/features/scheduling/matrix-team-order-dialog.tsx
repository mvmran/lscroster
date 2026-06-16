import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
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

/**
 * Reorder the Matrix team sections for the "All service types" view (issue #33).
 * Works on local state until Save, then hands the ordered ids back to the caller
 * (which persists them per-login in localStorage). Mirrors the up/down reorder
 * pattern used for service types (#31) — no dnd-kit, mobile-friendly.
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

  function move(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
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
            Set the order teams appear in your Matrix. This is saved on this
            device for your login only and doesn’t affect anyone else.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5">
          {items.map((team, index) => (
            <li
              key={team.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {team.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${team.name} up`}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${team.name} down`}
              >
                <ArrowDown className="size-4" />
              </Button>
            </li>
          ))}
        </ul>

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
