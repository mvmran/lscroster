import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import {
  duplicateLyricSection,
  moveLyricSection,
  parseLyricSections,
  removeLyricSection,
  type LyricSection,
} from '@/features/services/lyric-sections'
import { cn } from '@/lib/utils'

// Style properties copied onto the hidden mirror so its text wraps exactly
// like the textarea's, making marker offsets match the visible lines.
const MIRROR_STYLE_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'line-height',
  'text-transform',
  'word-spacing',
  'text-indent',
  'tab-size',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
]

/**
 * Measure the vertical pixel offset of each section's header line by
 * rendering the lyrics into a hidden div that mirrors the textarea's
 * typography and width. The textarea auto-grows (field-sizing: content) and
 * never scrolls internally, so these offsets map 1:1 onto the visible text.
 */
function useSectionTops(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  sections: LyricSection[],
) {
  const [tops, setTops] = useState<number[]>([])
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => {
      if (live) setFontsReady(true)
    })
    return () => {
      live = false
    }
  }, [])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el || sections.length === 0) {
      setTops([])
      return
    }
    function measure() {
      if (!el) return
      const cs = getComputedStyle(el)
      const mirror = document.createElement('div')
      mirror.setAttribute('aria-hidden', 'true')
      mirror.style.position = 'absolute'
      mirror.style.visibility = 'hidden'
      mirror.style.left = '-99999px'
      mirror.style.top = '0'
      mirror.style.height = 'auto'
      mirror.style.whiteSpace = 'pre-wrap'
      mirror.style.overflowWrap = 'break-word'
      mirror.style.boxSizing = 'border-box'
      mirror.style.width = `${el.offsetWidth}px`
      for (const prop of MIRROR_STYLE_PROPS) {
        mirror.style.setProperty(prop, cs.getPropertyValue(prop))
      }
      let cursor = 0
      const markers: HTMLSpanElement[] = []
      for (const s of sections) {
        mirror.append(document.createTextNode(value.slice(cursor, s.start)))
        const lineEnd = value.indexOf('\n', s.start)
        const headEnd = Math.min(lineEnd === -1 ? value.length : lineEnd, s.end)
        const marker = document.createElement('span')
        marker.textContent = value.slice(s.start, headEnd) || ' '
        mirror.append(marker)
        markers.push(marker)
        cursor = headEnd
      }
      mirror.append(document.createTextNode(value.slice(cursor)))
      document.body.append(mirror)
      setTops(markers.map((m) => m.offsetTop))
      mirror.remove()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [textareaRef, value, sections, fontsReady])

  return tops
}

function SectionChip({
  index,
  count,
  section,
  top,
  onDuplicate,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  section: LyricSection
  top: number
  onDuplicate: () => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: index })
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: index })

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      style={{ top }}
      className={cn(
        'absolute left-0 flex w-full items-center rounded-md border bg-card shadow-xs',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'ring-2 ring-ring',
      )}
    >
      <button
        type="button"
        aria-label={`Drag to move ${section.label}`}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none py-1.5 pl-1 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="min-w-0 flex-1 truncate py-1.5 pr-2 text-left text-xs font-medium"
          >
            {section.label}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy />
            Duplicate section
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ChevronUp />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ChevronDown />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 />
            Delete section
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Lyrics textarea with a derived structure gutter. Section labels are parsed
 * live from header lines in the text ("[Verse 1]", "Chorus:", …) and shown as
 * chips beside each section's first line. Dragging a chip (or its menu's
 * Move up/down), Duplicate and Delete all rewrite the textarea text in real
 * time via offset-based splices — nothing about the structure is persisted.
 */
export function LyricsStructureEditor({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (next: string) => void
}) {
  const sections = useMemo(() => parseLyricSections(value), [value])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tops = useSectionTops(textareaRef, value, sections)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveIndex(Number(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveIndex(null)
    const { active, over } = event
    if (over == null || active.id === over.id) return
    onChange(moveLyricSection(value, sections, Number(active.id), Number(over.id)))
  }

  const textarea = (
    <Textarea
      id={id}
      ref={textareaRef}
      rows={6}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono text-sm"
    />
  )

  if (sections.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {textarea}
        {value.trim() && (
          <p className="text-muted-foreground text-xs">
            Start a line with a section name — e.g.{' '}
            <span className="font-mono">[Verse 1]</span> or{' '}
            <span className="font-mono">Chorus:</span> — to get draggable
            section labels.
          </p>
        )}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveIndex(null)}
    >
      <div className="flex items-start gap-2">
        <div className="relative w-24 shrink-0 self-stretch sm:w-28">
          {sections.map((section, index) =>
            tops[index] === undefined ? null : (
              <SectionChip
                key={`${index}-${section.label}`}
                index={index}
                count={sections.length}
                section={section}
                top={tops[index]}
                onDuplicate={() => onChange(duplicateLyricSection(value, sections, index))}
                onMove={(to) => onChange(moveLyricSection(value, sections, index, to))}
                onRemove={() => onChange(removeLyricSection(value, sections, index))}
              />
            ),
          )}
        </div>
        <div className="min-w-0 flex-1">{textarea}</div>
      </div>
      <DragOverlay>
        {activeIndex !== null && sections[activeIndex] && (
          <div className="bg-card flex w-24 items-center gap-1 rounded-md border py-1.5 pl-1 shadow-md sm:w-28">
            <GripVertical className="text-muted-foreground size-3.5 shrink-0" />
            <span className="truncate text-xs font-medium">
              {sections[activeIndex].label}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
