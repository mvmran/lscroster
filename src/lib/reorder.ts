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
  type KeyboardSensorOptions,
  type MouseSensorOptions,
  type TouchSensorOptions,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/**
 * How every reorderable list in the app is dragged, so they all behave alike.
 *
 * - **Mouse:** the whole row (`useRowDrag`) — or just the grip, where a list's
 *   row is full of its own controls — once it has moved 5 px, so a click is
 *   still a click. The main button only, and not with Ctrl (a Mac's
 *   right-click): a middle-click to autoscroll or paste must not move
 *   anything, and a context menu must still open.
 * - **Finger:** the grip only, after a press-and-hold (250 ms, moving no more
 *   than 5 px). A swipe that starts on the grip scrolls the page, since the
 *   grip is `touch-manipulation` rather than `touch-none`, so scrolling a list
 *   on a phone can't move anything by accident.
 * - **Keyboard:** the grip, with Space and the arrow keys, for a sortable list.
 *
 * Use `ReorderGrip` (`components/reorder-grip.tsx`) for the grip.
 */

/** dnd-kit's mouse sensor, refusing every button but the main one, and Ctrl. */
class MainButtonMouseSensor extends MouseSensor {
  static activators: typeof MouseSensor.activators = [
    {
      eventName: 'onMouseDown',
      handler: ({ nativeEvent: event }, { onActivation }) => {
        if (event.button !== 0 || event.ctrlKey) return false
        onActivation?.({ event })
        return true
      },
    },
  ]
}

// Fixed, so dnd-kit's memoised sensors and activators survive a re-render.
const MOUSE: MouseSensorOptions = { activationConstraint: { distance: 5 } }
const TOUCH: TouchSensorOptions = { activationConstraint: { delay: 250, tolerance: 5 } }
const KEYS: KeyboardSensorOptions = { coordinateGetter: sortableKeyboardCoordinates }

/**
 * The sensors for a list. `enabled: false` (someone who can only read it)
 * gives none, so a read-only list adds no listeners — the touch sensor's
 * includes a non-passive `touchmove` on the window, which makes the browser
 * wait on the page before it scrolls. `keyboard: false` for a list whose drops
 * are found under the pointer, which keyboard moves don't have.
 */
export function useReorderSensors({
  enabled = true,
  keyboard = true,
}: { enabled?: boolean; keyboard?: boolean } = {}) {
  const mouse = useSensor(MainButtonMouseSensor, MOUSE)
  const touch = useSensor(TouchSensor, TOUCH)
  const keys = useSensor(KeyboardSensor, KEYS)
  // Always three entries (dnd-kit skips the nulls): the list is a memo's deps.
  return useSensors(
    enabled ? mouse : null,
    enabled ? touch : null,
    enabled && keyboard ? keys : null,
  )
}

/** A grip's look and touch handling, with a touch target bigger than its icon. */
export const GRIP_CLASS =
  'relative cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] ' +
  "after:absolute after:-inset-1.5 after:content-['']"

/** A row's own controls: a press on one is that control's, not a drag. */
const CONTROLS = [
  'button:not([data-grip])',
  '[role="button"]:not([data-grip])',
  '[role="menuitem"]',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ')

/**
 * Drag a row from anywhere with a mouse, and double-click it to edit (when
 * `onEdit` is given); a finger keeps to the grip and the row's edit button.
 * Spread `row` on the row's element and `grip` on its `ReorderGrip`. A
 * disabled sortable has no `listeners`, and then the row has nothing either.
 *
 * The row takes the mouse sensor's listener and the grip the touch and
 * keyboard ones, by name — so a sensor added to `useReorderSensors` must be
 * wired here too, or it is never attached. A press on one of the row's own
 * controls is that control's, and so is one inside a menu or popover the row
 * opens, which React bubbles to the row from its portal. A double-click edits
 * when the press itself came from a mouse or pen, not when the device's main
 * pointer does: an iPad with a trackpad has a mouse, and a finger on a
 * touchscreen laptop is still a finger. A double-click on the grip is a fumbled
 * grab, not a request to edit.
 */
export function useRowDrag(
  listeners: DraggableSyntheticListeners,
  { onEdit }: { onEdit?: () => void } = {},
) {
  const pressedWith = useRef('')
  const fromRow = (e: MouseEvent) => {
    if (!e.currentTarget.contains(e.target as Node)) return false
    const control = (e.target as Element).closest(CONTROLS)
    return !(control && e.currentTarget.contains(control))
  }
  const enabled = listeners != null
  const edit =
    enabled && onEdit
      ? {
          onPointerDown: (e: PointerEvent) => {
            pressedWith.current = e.pointerType
          },
          onDoubleClick: (e: MouseEvent) => {
            const byHand = ['mouse', 'pen'].includes(pressedWith.current)
            if (byHand && fromRow(e) && !(e.target as Element).closest('[data-grip]')) {
              onEdit()
            }
          },
        }
      : {}
  return {
    row: enabled
      ? {
          ...edit,
          onMouseDown: (e: MouseEvent) => {
            if (fromRow(e)) listeners?.onMouseDown?.(e)
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

/**
 * For a dialog that holds a reorderable list (`onEscapeKeyDown`): Escape during
 * a drag cancels the drag, not the dialog and its unsaved edits. The dialog
 * hears Escape first; dnd-kit still hears it after and drops the item back.
 * dnd-kit marks the item being dragged `aria-pressed`.
 */
export function keepOpenWhileDragging(event: { preventDefault: () => void }) {
  if (document.querySelector('[aria-roledescription][aria-pressed="true"]')) {
    event.preventDefault()
  }
}
