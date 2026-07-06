import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  GripVertical,
  Trash2,
} from 'lucide-react'
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

// One tint per section family, shared by the gutter chevrons, the extent
// rails and the flow-strip pills so a chorus reads as the same colour
// everywhere. Kinds not listed fall back to slate.
const SECTION_TINTS: Record<string, { chip: string; rail: string }> = {
  verse: {
    chip: 'bg-sky-200/70 text-sky-900 dark:bg-sky-900/60 dark:text-sky-200',
    rail: 'bg-sky-500/50 dark:bg-sky-400/40',
  },
  chorus: {
    chip: 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
    rail: 'bg-emerald-500/50 dark:bg-emerald-400/40',
  },
  refrain: {
    chip: 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
    rail: 'bg-emerald-500/50 dark:bg-emerald-400/40',
  },
  'pre-chorus': {
    chip: 'bg-teal-200/70 text-teal-900 dark:bg-teal-900/60 dark:text-teal-200',
    rail: 'bg-teal-500/50 dark:bg-teal-400/40',
  },
  bridge: {
    chip: 'bg-amber-200/70 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
    rail: 'bg-amber-500/50 dark:bg-amber-400/40',
  },
  instrumental: {
    chip: 'bg-violet-200/70 text-violet-900 dark:bg-violet-900/60 dark:text-violet-200',
    rail: 'bg-violet-500/50 dark:bg-violet-400/40',
  },
}
for (const kind of ['interlude', 'vamp', 'turnaround', 'breakdown', 'channel', 'descant', 'hook']) {
  SECTION_TINTS[kind] = SECTION_TINTS.instrumental
}
const DEFAULT_TINT = {
  chip: 'bg-slate-200/70 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
  rail: 'bg-slate-400/50 dark:bg-slate-500/40',
}
const tintOf = (kind: string) => SECTION_TINTS[kind] ?? DEFAULT_TINT

// Prefer the chip directly under the pointer; fall back to nearest centre so
// a drop in the gap between small chips still lands somewhere sensible.
const collideAtPointer: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  return within.length > 0 ? within : closestCenter(args)
}

// Pennant shape with a 10px tip pointing at the lyrics. clip-path clips
// box-shadow, so elevation comes from drop-shadow (which follows the clip).
const CHEVRON_CLIP =
  '[clip-path:polygon(0_0,calc(100%_-_10px)_0,100%_50%,calc(100%_-_10px)_100%,0_100%)]'

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

interface SectionRect {
  top: number
  height: number
}

/**
 * Measure each section's vertical pixel extent (header line through last
 * non-blank line) by rendering the lyrics into a hidden div that mirrors the
 * textarea's typography and width. The textarea auto-grows
 * (field-sizing: content) and never scrolls internally, so these offsets map
 * 1:1 onto the visible text.
 */
function useSectionRects(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  sections: LyricSection[],
) {
  const [rects, setRects] = useState<SectionRect[]>([])
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
      setRects([])
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
        const chunk = value.slice(s.start, s.end)
        const contentEnd = s.start + chunk.replace(/\s+$/, '').length
        const marker = document.createElement('span')
        marker.textContent = value.slice(s.start, contentEnd) || ' '
        mirror.append(marker)
        markers.push(marker)
        cursor = contentEnd
      }
      mirror.append(document.createTextNode(value.slice(cursor)))
      document.body.append(mirror)
      const mirrorTop = mirror.getBoundingClientRect().top
      setRects(
        markers.map((m) => {
          const r = m.getBoundingClientRect()
          return { top: r.top - mirrorTop, height: r.height }
        }),
      )
      mirror.remove()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [textareaRef, value, sections, fontsReady])

  return rects
}

function SectionMenu({
  index,
  count,
  onDuplicate,
  onMove,
  onRemove,
  children,
}: {
  index: number
  count: number
  onDuplicate: () => void
  onMove: (to: number) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
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
  )
}

interface SectionActions {
  onDuplicate: () => void
  onMove: (to: number) => void
  onRemove: () => void
}

function SectionChevron({
  index,
  count,
  section,
  rect,
  actions,
}: {
  index: number
  count: number
  section: LyricSection
  rect: SectionRect
  actions: SectionActions
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `c-${index}` })
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `c-${index}` })
  const tint = tintOf(section.kind)

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      style={{ top: rect.top - 2 }}
      className={cn(
        'absolute left-0 z-10 flex h-[25px] w-[calc(100%_+_26px)] items-center drop-shadow-sm',
        CHEVRON_CLIP,
        tint.chip,
        isDragging && 'opacity-40',
        isOver && !isDragging && 'brightness-110 saturate-150',
      )}
    >
      <button
        type="button"
        aria-label={`Drag to move ${section.label}`}
        className="shrink-0 cursor-grab touch-none py-1.5 pl-1 opacity-70 hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <SectionMenu index={index} count={count} {...actions}>
        <button
          type="button"
          className="min-w-0 flex-1 truncate py-1.5 pr-4 text-left text-xs font-medium"
        >
          {section.label}
        </button>
      </SectionMenu>
    </div>
  )
}

function FlowPill({
  index,
  count,
  section,
  actions,
}: {
  index: number
  count: number
  section: LyricSection
  actions: SectionActions
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `p-${index}` })
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `p-${index}` })
  const tint = tintOf(section.kind)

  return (
    <div
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      className={cn(
        'flex items-center rounded-full shadow-xs',
        tint.chip,
        isDragging && 'opacity-40',
        isOver && !isDragging && 'ring-ring ring-2',
      )}
    >
      <button
        type="button"
        aria-label={`Drag to move ${section.label}`}
        className="shrink-0 cursor-grab touch-none py-1 pl-1.5 opacity-70 hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3" />
      </button>
      <SectionMenu index={index} count={count} {...actions}>
        <button type="button" className="py-1 pr-2.5 text-left text-xs font-medium">
          {section.label}
        </button>
      </SectionMenu>
    </div>
  )
}

/**
 * Lyrics textarea with a derived structure view. Section labels are parsed
 * live from header lines in the text ("[Verse 1]", "Chorus:", …) — shown as
 * colour-coded chevrons pointing at each section's first line, extent rails
 * marking how far each section runs, and a draggable flow strip above the
 * editor summarising the song's shape. Dragging a chevron or pill (or the
 * menu's Move up/down), Duplicate and Delete all rewrite the textarea text in
 * real time via offset-based splices — nothing about the structure is
 * persisted.
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
  const rects = useSectionRects(textareaRef, value, sections)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const indexOfId = (dndId: string | number) => Number(String(dndId).slice(2))

  function handleDragStart(event: DragStartEvent) {
    setActiveIndex(indexOfId(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveIndex(null)
    const { active, over } = event
    ;(window as unknown as Record<string, unknown>).__lastDrag = {
      active: active.id,
      over: over?.id ?? null,
      rect: event.active.rect.current.translated,
    }
    if (over == null) return
    const from = indexOfId(active.id)
    const to = indexOfId(over.id)
    if (from !== to) onChange(moveLyricSection(value, sections, from, to))
  }

  const actionsFor = (index: number): SectionActions => ({
    onDuplicate: () => onChange(duplicateLyricSection(value, sections, index)),
    onMove: (to) => onChange(moveLyricSection(value, sections, index, to)),
    onRemove: () => onChange(removeLyricSection(value, sections, index)),
  })

  const textarea = (
    <Textarea
      id={id}
      ref={textareaRef}
      rows={6}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('font-mono text-sm', sections.length > 0 && 'pl-5')}
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
      collisionDetection={collideAtPointer}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveIndex(null)}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
          {sections.map((section, index) => (
            <span key={`p-${index}-${section.label}`} className="flex items-center gap-x-1">
              {index > 0 && (
                <ChevronRight className="text-muted-foreground/60 size-3.5 shrink-0" />
              )}
              <FlowPill
                index={index}
                count={sections.length}
                section={section}
                actions={actionsFor(index)}
              />
            </span>
          ))}
        </div>
        <div className="flex items-start gap-2">
          <div className="relative w-24 shrink-0 self-stretch sm:w-28">
            {sections.map((section, index) =>
              rects[index] === undefined ? null : (
                <div key={`c-${index}-${section.label}`}>
                  <div
                    style={{ top: rects[index].top + 2, height: Math.max(rects[index].height - 4, 16) }}
                    className={cn(
                      'absolute left-[calc(100%_+_7px)] w-0.5 rounded-full',
                      tintOf(section.kind).rail,
                    )}
                  />
                  <SectionChevron
                    index={index}
                    count={sections.length}
                    section={section}
                    rect={rects[index]}
                    actions={actionsFor(index)}
                  />
                </div>
              ),
            )}
          </div>
          <div className="min-w-0 flex-1">{textarea}</div>
        </div>
      </div>
      <DragOverlay>
        {activeIndex !== null && sections[activeIndex] && (
          <div
            className={cn(
              'flex w-fit items-center gap-1 rounded-full py-1 pr-2.5 pl-1.5 shadow-md',
              tintOf(sections[activeIndex].kind).chip,
            )}
          >
            <GripVertical className="size-3 shrink-0 opacity-70" />
            <span className="truncate text-xs font-medium">
              {sections[activeIndex].label}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
