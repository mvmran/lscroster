import {
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from 'react'
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/**
 * How every reorderable list in the app is dragged, so they all behave alike.
 *
 * - **Mouse:** the whole row (`useRowDrag`) — or just the grip, where a list's
 *   row is full of its own controls — once it has moved 5 px, so a click is
 *   still a click. Only the main button: a middle-click to autoscroll or paste
 *   must not move anything.
 * - **Finger:** the grip only, after a press-and-hold (250 ms, moving no more
 *   than 5 px). A swipe that starts on the grip scrolls the page, since the
 *   grip is `touch-manipulation` rather than `touch-none`, so scrolling a list
 *   on a phone can't move anything by accident.
 * - **Keyboard:** the grip, with Space and the arrow keys, for a sortable list.
 */
export function useReorderSensors({ keyboard = true }: { keyboard?: boolean } = {}) {
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 5 } })
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  })
  const keys = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
  return useSensors(mouse, touch, ...(keyboard ? [keys] : []))
}

/** A grip's look and touch handling: no scroll-blocking, no iOS callout. */
export const GRIP_CLASS =
  'cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]'

/**
 * Drag a row from anywhere with a mouse, and double-click it to edit; a finger
 * keeps to the grip (and the row's own edit button). Spread `row` on the row's
 * element and `grip` on its grip button, with `{...attributes}` beside it.
 *
 * The row takes the `MouseSensor`'s listener and the grip the `TouchSensor`'s
 * and `KeyboardSensor`'s, by name — so a sensor added to `useReorderSensors`
 * must be wired here too, or it is never attached. A press on the row's own
 * buttons, links or fields is theirs, and so is one inside a menu or popover
 * the row opens, which React bubbles to the row from its portal. Whether a
 * double-click came from a mouse is read from the press itself, not the
 * device's main pointer: an iPad with a trackpad has a mouse, and a finger on a
 * touchscreen laptop is still a finger.
 */
export function useRowDrag(
  listeners: DraggableSyntheticListeners,
  { enabled = true, onEdit }: { enabled?: boolean; onEdit?: () => void } = {},
) {
  const pressedWith = useRef('')
  const fromRow = (e: MouseEvent) =>
    e.button === 0 &&
    e.currentTarget.contains(e.target as Node) &&
    !(e.target as Element).closest(
      'button:not([data-grip]), a, input, textarea, select',
    )
  return {
    row: enabled
      ? {
          onPointerDown: (e: PointerEvent) => {
            pressedWith.current = e.pointerType
          },
          onMouseDown: (e: MouseEvent) => {
            if (fromRow(e)) listeners?.onMouseDown?.(e)
          },
          onDoubleClick: (e: MouseEvent) => {
            if (onEdit && fromRow(e) && pressedWith.current === 'mouse') onEdit()
          },
        }
      : {},
    /** The row's mouse cursor and no text selection, where there is a mouse. */
    rowClassName: enabled
      ? 'any-pointer-fine:cursor-grab any-pointer-fine:select-none'
      : '',
    grip: {
      'data-grip': '',
      onTouchStart: (e: TouchEvent) => listeners?.onTouchStart?.(e),
      onKeyDown: (e: KeyboardEvent) => listeners?.onKeyDown?.(e),
    },
  }
}
