import type { ComponentProps } from 'react'
import { GripVertical } from 'lucide-react'
import { GRIP_CLASS } from '@/lib/reorder'
import { cn } from '@/lib/utils'

/**
 * The ⋮⋮ handle every reorderable list moves an item by (`lib/reorder.ts`):
 * a press-and-hold for a finger, the keyboard's way in, and — where a list
 * drags by its grip only — the mouse's too. Its touch target reaches past the
 * icon, so a small grip in a tight row is still easy to hold. Spread dnd-kit's
 * `attributes` and the row's `grip` props (or a grip-only list's `listeners`)
 * onto it; `label` names it for screen readers and the tooltip.
 */
export function ReorderGrip({
  label,
  title,
  className,
  iconClassName = 'size-4',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  label: string
  iconClassName?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      className={cn(GRIP_CLASS, className)}
      {...props}
    >
      <GripVertical className={iconClassName} />
    </button>
  )
}
