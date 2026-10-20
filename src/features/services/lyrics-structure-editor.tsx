import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  alignLayer,
  duplicateSectionLayers,
  findNonLatinLyrics,
  LAYER_LABELS,
  layerLineMismatch,
  lineCount,
  lyricParagraphs,
  LYRIC_LAYER_KEYS,
  moveSectionLayers,
  removeSectionLayers,
  renameSectionHeading,
  type LayeredLyrics,
  type LyricLayerKey,
} from '@/features/services/lyric-layers'
import {
  chordsIn,
  chordsToNumbers,
  type ChordNotation,
  type SongKey,
} from '@/features/services/chord-notation'
import {
  diffText,
  hasChanges,
  hasInserted,
  NO_DIFF,
  type TextDiff,
} from '@/features/services/lyric-diff'
import { DiffSpans } from '@/features/services/lyric-diff-spans'
import {
  followSectionEdit,
  parseLyricSections,
  type HeadingRename,
  type LyricSection,
} from '@/features/services/lyric-sections'
import { tintOf } from '@/features/services/section-tints'
import { cn } from '@/lib/utils'

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
  // Split mode turns wrapping off (see LyricPane) so one logical line is always
  // one visual row; the mirror has to follow or its section offsets drift.
  'white-space',
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
 * A hidden div set exactly like the textarea — typography, padding, border and
 * width — so text appended to it wraps where the textarea's does. The caller
 * fills it, appends it to the body, measures, and removes it.
 */
function makeMirror(el: HTMLTextAreaElement): HTMLDivElement {
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
  return mirror
}

/**
 * Where each line of a pane sits, top and height in pixels from the
 * textarea's top edge — a wrapped line spans its rows — for the unsaved-change
 * bars beside it. Measured only while `active` (there is something to mark),
 * since it lays the whole text out on every keystroke.
 */
function useLineRects(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  active: boolean,
) {
  const [rects, setRects] = useState<SectionRect[]>([])
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el || !active) {
      setRects([])
      return
    }
    function measure() {
      if (!el) return
      const mirror = makeMirror(el)
      const spans = value.split('\n').map((line, i) => {
        if (i > 0) mirror.append(document.createTextNode('\n'))
        const span = document.createElement('span')
        // An empty span has no height of its own; a zero-width space gives
        // a blank line its row.
        span.textContent = line === '' ? '​' : line
        mirror.append(span)
        return span
      })
      document.body.append(mirror)
      const top = mirror.getBoundingClientRect().top
      setRects(
        spans.map((span) => {
          const r = span.getBoundingClientRect()
          return { top: r.top - top, height: r.height }
        }),
      )
      mirror.remove()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [textareaRef, value, active])
  return rects
}

/**
 * The unsaved-change marks at a pane's left edge: a red bar beside each line
 * changed in any way, and a short tick where a line was taken out altogether.
 * Placed over the textarea's left padding, so they never cover the text.
 */
function ChangeMarks({ diff, rects }: { diff: TextDiff; rects: SectionRect[] }) {
  if (rects.length === 0) return null
  const last = rects[rects.length - 1]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-2">
      {[...diff.changed.keys()].map((line) =>
        rects[line] === undefined ? null : (
          <div
            key={`c${line}`}
            className="bg-destructive absolute left-[3px] w-[3px] rounded-full"
            style={{
              top: rects[line].top + 1,
              height: Math.max(rects[line].height - 2, 4),
            }}
          />
        ),
      )}
      {[...diff.removedBefore].map((line) => (
        <div
          key={`r${line}`}
          className="bg-destructive absolute left-[2px] h-[3px] w-2 -translate-y-1/2 rounded-full"
          style={{ top: line < rects.length ? rects[line].top : last.top + last.height }}
        />
      ))}
    </div>
  )
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
      const mirror = makeMirror(el)
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
        'absolute left-0 z-10 flex h-[25px] w-[54px] items-center drop-shadow-sm',
        CHEVRON_CLIP,
        tint.chip,
        isDragging && 'opacity-40',
        isOver && !isDragging && 'brightness-110 saturate-150',
      )}
    >
      <button
        type="button"
        aria-label={`Drag to move ${section.label}`}
        title={`Drag to move ${section.label}`}
        className="shrink-0 cursor-grab touch-none py-1.5 pl-0.5 opacity-70 hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <SectionMenu index={index} count={count} {...actions}>
        <button
          type="button"
          title={section.label}
          className="flex-1 py-1.5 pr-3.5 pl-0.5 text-left text-xs font-medium"
        >
          {section.short}
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
        title={`Drag to move ${section.label}`}
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


// Both panes share an explicit leading so one logical line occupies the same
// vertical row in each — and 1.5rem gives Malayalam/Devanagari conjuncts room
// that the default `text-sm` leading clips.
const PANE_LEADING = 'leading-6'

/**
 * Row numbers beside a pane. Only rendered in split mode, where wrapping is off
 * and one logical line is therefore always one visual row — stacked on a phone
 * the matching lines are half a screen apart, so the number is the only way to
 * confirm you're editing line 14 against line 14.
 *
 * `pt` matches the textarea's 8px padding plus its 1px border.
 */
function LineNumbers({ count }: { count: number }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'text-muted-foreground/50 w-7 shrink-0 select-none pt-[9px] pr-1.5 text-right font-mono text-base tabular-nums md:text-sm',
        PANE_LEADING,
      )}
    >
      {Array.from({ length: Math.max(count, 1) }, (_, i) => (
        <div key={i}>{i + 1}</div>
      ))}
    </div>
  )
}

/**
 * The three layer buttons that open the split. Mutually exclusive — pressing
 * the pressed-in one pops it out and closes the split. Rendered by the page so
 * it can sit on the field's header row, right-aligned, where it reads as
 * "beside the label" closed and "above the right pane" open.
 */
export function LyricLayerToggle({
  layers,
  value,
  onChange,
  disabled,
}: {
  layers: LayeredLyrics
  value: LyricLayerKey | null
  onChange: (next: LyricLayerKey | null) => void
  disabled?: boolean
}) {
  return (
    <ToggleGroup
      type="single"
      value={value ?? ''}
      onValueChange={(next) => onChange(next === '' ? null : (next as LyricLayerKey))}
      disabled={disabled}
    >
      {LYRIC_LAYER_KEYS.map((key) => (
        <ToggleGroupItem
          key={key}
          value={key}
          title={
            value === key
              ? `Hide the ${LAYER_LABELS[key].toLowerCase()} pane`
              : `Edit ${LAYER_LABELS[key].toLowerCase()} text beside the lyrics, line by line`
          }
        >
          {LAYER_LABELS[key]}
          {layers[key].trim() !== '' && (
            // Accent, not the button's own text colour: the dot says this
            // layer already carries text, worth spotting before pressing.
            <span className="bg-primary ml-1.5 size-1.5 rounded-full" />
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * Lyrics editor with a derived structure view and an optional second pane.
 *
 * Section labels are parsed live from header lines in the base text
 * ("[Verse 1]", "Chorus:", …) — shown as colour-coded chevrons pointing at each
 * section's first line, extent rails marking how far each section runs, and a
 * draggable flow strip above the editor summarising the song's shape. Dragging
 * a chevron or pill (or the menu's Move up/down), Duplicate and Delete rewrite
 * the text in real time; nothing about the structure is persisted.
 *
 * When a layer is selected the editor splits — vertically on a desktop,
 * horizontally on a phone — with the base lyrics in the first pane and the
 * layer in the second. Both panes turn wrapping off (`wrap="off"`), so one
 * logical line is always one visual row and line N sits at the same height in
 * both. Every section splice runs through `lyric-layers`, which applies the
 * same line-range rearrangement to all four layers at once.
 */
export function LyricsStructureEditor({
  id,
  layers,
  activeLayer,
  onChange,
  onGenerateMeaning,
  generatingMeaning,
  onPolishTransliteration,
  polishingTransliteration,
  onLabelSections,
  labellingSections,
  chordNotation = 'letters',
  songKey = null,
  saved,
}: {
  id?: string
  layers: LayeredLyrics
  /**
   * The layers as last saved. What differs is marked: red text once a pane
   * loses focus, a red bar beside each changed line. Absent, nothing is.
   */
  saved?: LayeredLyrics
  activeLayer: LyricLayerKey | null
  onChange: (next: LayeredLyrics) => void
  /** Draft the meaning from the native text; absent when not configured. */
  onGenerateMeaning?: () => void
  generatingMeaning?: boolean
  /** Rewrite the base text from the native script; absent when not configured. */
  onPolishTransliteration?: () => void
  polishingTransliteration?: boolean
  /** Name the paragraphs Verse / Chorus / Bridge; absent when not configured. */
  onLabelSections?: () => void
  labellingSections?: boolean
  /** Which notation the chord pane is read and typed in. */
  chordNotation?: ChordNotation
  /** The arrangement's key, for converting chords. Null when it has none. */
  songKey?: SongKey | null
}) {
  const sections = useMemo(() => parseLyricSections(layers.lyrics), [layers.lyrics])
  // Only offered where there is more than one paragraph to tell apart: a single
  // "Verse 1" over the whole song is structure in name alone.
  const paragraphs = useMemo(() => lyricParagraphs(layers.lyrics), [layers.lyrics])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rects = useSectionRects(textareaRef, layers.lyrics, sections)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const chordPaneRef = useRef<HTMLTextAreaElement>(null)
  const [chordPaneFocused, setChordPaneFocused] = useState(false)
  const [baseFocused, setBaseFocused] = useState(false)
  const baseOverlayRef = useRef<HTMLDivElement>(null)
  const paneOverlayRef = useRef<HTMLDivElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )
  const split = activeLayer !== null

  const indexOfId = (dndId: string | number) => Number(String(dndId).slice(2))

  // A repeat whose words are changed becomes a section of its own, so its
  // heading takes the next number ("VERSE" → "VERSE 2"), and changes back if
  // the words come back. `renamed` remembers which headings this did.
  const renamed = useRef<HeadingRename[]>([])
  const caret = useRef<{ pane: 'base' | 'layer'; start: number; end: number } | null>(
    null,
  )

  /**
   * Pass an edit on, renumbering a repeat it made a section of its own — by
   * its words in the lyrics pane, or its chords in the chord pane.
   */
  function applyEdit(
    next: LayeredLyrics,
    pane: 'base' | 'layer',
    field: keyof LayeredLyrics,
    target: HTMLTextAreaElement,
  ) {
    const followed = followSectionEdit(layers, next, renamed.current)
    renamed.current = followed.renamed
    if (followed.rename === null) {
      onChange(next)
      return
    }
    const renumbered = renameSectionHeading(next, followed.rename)
    // The heading sits above what is being typed, so the caret moves on by
    // however much longer (or shorter) this pane's text became.
    const shift = renumbered[field].length - next[field].length
    caret.current = {
      pane,
      start: target.selectionStart + shift,
      end: target.selectionEnd + shift,
    }
    onChange(renumbered)
  }

  function onBaseChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    applyEdit({ ...layers, lyrics: event.target.value }, 'base', 'lyrics', event.target)
  }

  useLayoutEffect(() => {
    const at = caret.current
    const pane = at?.pane === 'layer' ? chordPaneRef.current : textareaRef.current
    if (at === null || pane === null) return
    caret.current = null
    pane.setSelectionRange(at.start, at.end)
  }, [layers.lyrics, layers.chords])

  function handleDragStart(event: DragStartEvent) {
    setActiveIndex(indexOfId(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveIndex(null)
    const { active, over } = event
    if (over == null) return
    const from = indexOfId(active.id)
    const to = indexOfId(over.id)
    if (from !== to) onChange(moveSectionLayers(layers, sections, from, to))
  }

  const actionsFor = (index: number): SectionActions => ({
    onDuplicate: () => onChange(duplicateSectionLayers(layers, sections, index)),
    onMove: (to) => onChange(moveSectionLayers(layers, sections, index, to)),
    onRemove: () => onChange(removeSectionLayers(layers, sections, index)),
  })

  // What isn't saved yet. The bars show as soon as a line changes, typing or
  // not; the red text needs the overlay, which only stands in for the
  // textarea once it loses focus (a textarea can't colour its own text).
  const baseDiff = useMemo(
    () => (saved ? diffText(saved.lyrics, layers.lyrics) : NO_DIFF),
    [saved, layers.lyrics],
  )
  const baseRects = useLineRects(textareaRef, layers.lyrics, hasChanges(baseDiff))
  const showBaseOverlay = !baseFocused && hasInserted(baseDiff)

  // The overlay is a copy of the text over the textarea; it follows any
  // sideways scroll of a pane that doesn't wrap.
  function followScroll(
    overlay: HTMLDivElement | null,
    event: React.UIEvent<HTMLTextAreaElement>,
  ) {
    if (overlay === null) return
    overlay.scrollLeft = event.currentTarget.scrollLeft
    overlay.scrollTop = event.currentTarget.scrollTop
  }

  // Shared by the textarea and its overlay, so the copy wraps where it does.
  const baseTextClasses = cn(
    'font-sans text-sm',
    sections.length > 0 && 'pl-5',
    split && `${PANE_LEADING} whitespace-pre`,
  )

  const baseTextarea = (
    <Textarea
      id={id}
      ref={textareaRef}
      rows={6}
      wrap={split ? 'off' : undefined}
      value={layers.lyrics}
      onChange={onBaseChange}
      onFocus={() => setBaseFocused(true)}
      onBlur={() => setBaseFocused(false)}
      onScroll={(event) => followScroll(baseOverlayRef.current, event)}
      className={cn(
        // Proportional, like every other lyric surface — chords are
        // placed by their brackets now, so no pane needs a monospace grid.
        'font-sans text-sm',
        // No drag handle. The pane grows with its content on its own, so the
        // handle's only real power was to make the box *shorter* than the
        // song — and then the words scroll inside it while the gutter
        // chevrons and section rails do not, because those are placed from
        // measured text offsets rather than from the scrolled box. They stay
        // where they were and hang off the bottom. Fixed to the content, a
        // song of any length lines up with its own gutter.
        'resize-none',
        baseTextClasses,
        showBaseOverlay && 'text-transparent',
      )}
    />
  )

  const baseOverlay = showBaseOverlay && (
    <div
      aria-hidden
      ref={(node) => {
        baseOverlayRef.current = node
        if (node && textareaRef.current) node.scrollLeft = textareaRef.current.scrollLeft
      }}
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden rounded-lg',
        'border border-transparent px-2.5 py-2',
        split ? '' : 'break-words whitespace-pre-wrap',
        baseTextClasses,
      )}
    >
      <DiffSpans text={layers.lyrics} diff={baseDiff} />
    </div>
  )

  const baseColumn = (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      {sections.length > 0 && (
        <div className="relative w-7 shrink-0 self-stretch">
          {sections.map((section, index) =>
            rects[index] === undefined ? null : (
              <div key={`c-${index}-${section.label}`}>
                <div
                  style={{
                    top: rects[index].top + 2,
                    height: Math.max(rects[index].height - 4, 16),
                  }}
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
      )}
      {split && <LineNumbers count={lineCount(layers.lyrics)} />}
      <div className="relative min-w-0 flex-1">
        {baseTextarea}
        {baseOverlay}
        <ChangeMarks diff={baseDiff} rects={baseRects} />
      </div>
    </div>
  )

  // The buffer holds chords the way they are stored — in numbers — and the
  // pane converts on the way in and out, so the notation toggle is a view of
  // one text rather than an edit to it. Both conversions leave anything they
  // don't recognise alone, so a half-typed chord survives the round trip and
  // the pane never fights the person typing in it.
  const paneValue =
    activeLayer === 'chords'
      ? chordsIn(layers.chords, chordNotation, songKey)
      : activeLayer === null
        ? ''
        : layers[activeLayer]

  function onPaneChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    if (activeLayer === null) return
    const text = event.target.value
    const next =
      activeLayer === 'chords' && chordNotation === 'letters'
        ? chordsToNumbers(text, songKey)
        : text
    applyEdit({ ...layers, [activeLayer]: next }, 'layer', activeLayer, event.target)
  }

  // The pane's unsaved changes, compared in the notation it shows, so flipping
  // letters/numbers never reads as an edit.
  const savedPane =
    saved === undefined || activeLayer === null
      ? null
      : activeLayer === 'chords'
        ? chordsIn(saved.chords, chordNotation, songKey)
        : saved[activeLayer]
  const paneDiff = useMemo(
    () => (savedPane === null ? NO_DIFF : diffText(savedPane, paneValue)),
    [savedPane, paneValue],
  )
  const paneRects = useLineRects(chordPaneRef, paneValue, hasChanges(paneDiff))

  // Chords read as a chart whenever nobody is typing in them, the way the
  // Services sheet sets them, and fall back to plain text on focus: colouring
  // a half-typed bracket fights the person writing it. Any other layer gets
  // the overlay only to show what isn't saved.
  const showChordSpans =
    !chordPaneFocused &&
    paneValue.trim() !== '' &&
    (activeLayer === 'chords' || hasInserted(paneDiff))

  // The coloured text is laid *over* the textarea rather than swapped in for
  // it. Same box, same metrics, so nothing shifts on focus — and because the
  // overlay ignores the pointer, a click lands in the textarea underneath at
  // the character it was aimed at, instead of dropping the caret at the end.
  const syncOverlayScroll = useCallback((node: HTMLDivElement | null) => {
    paneOverlayRef.current = node
    const pane = chordPaneRef.current
    if (node === null || pane === null) return
    node.scrollLeft = pane.scrollLeft
    node.scrollTop = pane.scrollTop
  }, [])

  const layerColumn = activeLayer && (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <LineNumbers count={lineCount(layers[activeLayer])} />
      <div className="relative min-w-0 flex-1">
        <Textarea
          ref={chordPaneRef}
          rows={6}
          wrap="off"
          aria-label={`${LAYER_LABELS[activeLayer]} text, line by line against the lyrics`}
          value={paneValue}
          onChange={onPaneChange}
          onFocus={() => setChordPaneFocused(true)}
          onBlur={() => setChordPaneFocused(false)}
          onScroll={(event) => followScroll(paneOverlayRef.current, event)}
          className={cn(
            // Fixed for the same reason as the base pane, plus one of its
            // own: this pane is line-parallel to that one, and a handle that
            // shortens only this half scrolls its rows away from the lyrics
            // they belong to.
            'resize-none text-sm whitespace-pre font-sans',
            PANE_LEADING,
            showChordSpans && 'text-transparent',
          )}
        />
        {showChordSpans && (
          <div
            aria-hidden
            ref={syncOverlayScroll}
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden rounded-lg',
              'border border-transparent px-2.5 py-2',
              'text-sm whitespace-pre font-sans',
              PANE_LEADING,
            )}
          >
            <DiffSpans text={paneValue} diff={paneDiff} chords={activeLayer === 'chords'} />
          </div>
        )}
        <ChangeMarks diff={paneDiff} rects={paneRects} />
      </div>
    </div>
  )

  // Non-Latin script in the base text (the save is blocked on the same check).
  const stray = findNonLatinLyrics(layers.lyrics)
  const scriptHint = stray && (
    <p className="text-destructive text-xs">
      Line {stray.line} of the lyrics is not Latin script ({stray.sample}). Type
      the singable transliteration here, and use the{' '}
      <span className="font-medium">{LAYER_LABELS.native}</span> button above for
      the original script.
    </p>
  )

  const mismatch = activeLayer
    ? layerLineMismatch(layers).find((m) => m.key === activeLayer)
    : undefined

  // Drafting only ever fills an empty meaning pane: overwriting a gloss someone
  // wrote, on one click with no undo, is not a trade worth making.
  const canDraftMeaning =
    activeLayer === 'meaning' &&
    onGenerateMeaning !== undefined &&
    layers.meaning.trim() === '' &&
    layers.native.trim() !== ''

  const draftMeaningButton = canDraftMeaning && (
    <button
      type="button"
      className="text-primary underline underline-offset-2 disabled:opacity-60"
      disabled={generatingMeaning}
      onClick={onGenerateMeaning}
    >
      {generatingMeaning ? 'Drafting…' : 'Draft it from the native text'}
    </button>
  )

  // Blank covers both an untouched pane and one holding only the rows the
  // "add the missing blank lines" button just seeded: neither has text to be
  // out of step, so both get the guidance rather than a drift warning.
  const layerBlank = activeLayer !== null && layers[activeLayer].trim() === ''

  const layerHint = activeLayer &&
    (mismatch || layerBlank) && (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {layerBlank || !mismatch ? (
        <span>
          Type the {LAYER_LABELS[activeLayer].toLowerCase()} text line by line
          against the lyrics — line 1 here belongs to line 1 there.
          {activeLayer === 'chords' && (
            <>
              {' '}
              Wrap each chord in brackets —{' '}
              <span className="font-mono">
                [{chordNotation === 'numbers' ? '1' : 'G'}]
              </span>{' '}
              on its own, or{' '}
              <span className="font-mono">
                [{chordNotation === 'numbers' ? '1' : 'G'}]Amazing
              </span>{' '}
              ChordPro style — and it is picked out above the line.
            </>
          )}
        </span>
      ) : (
        <span>
          {LAYER_LABELS[activeLayer]} has {mismatch.lines} lines against{' '}
          {mismatch.baseLines} in the lyrics, so they no longer line up.
        </span>
      )}
      {(layers[activeLayer] === '' ||
        (mismatch !== undefined && mismatch.lines < mismatch.baseLines)) && (
        <button
          type="button"
          className="text-primary underline underline-offset-2"
          onClick={() => onChange(alignLayer(layers, activeLayer))}
        >
          Add the missing blank lines
        </button>
      )}
      {draftMeaningButton}
    </p>
  )

  // With the lyrics pane empty there is no draft to correct, so the same call
  // writes one from scratch. That is the way to romanise a script the offline
  // romaniser doesn't cover, and the way out of a draft past correcting: clear
  // the pane and ask again.
  const fromScratch = layers.lyrics.trim() === ''

  // Offered from the native pane, because that is the text it reads — and only
  // once there is a script to read.
  const polishHint = activeLayer === 'native' &&
    onPolishTransliteration !== undefined &&
    layers.native.trim() !== '' && (
      <p className="text-muted-foreground text-xs">
        <button
          type="button"
          className="text-primary underline underline-offset-2 disabled:opacity-60"
          disabled={polishingTransliteration}
          onClick={onPolishTransliteration}
        >
          {polishingTransliteration
            ? fromScratch
              ? 'Writing…'
              : 'Polishing…'
            : fromScratch
              ? 'Write the transliteration for me'
              : 'Polish the transliteration'}
        </button>{' '}
        — the lyrics pane is {fromScratch ? 'written' : 'rewritten'} from this
        script, spelled the way a singer would read it aloud. Nothing is saved
        until you press Save changes.
      </p>
    )

  const body = (
    <div className={cn('flex gap-3', split ? 'flex-col md:flex-row' : 'flex-col')}>
      {baseColumn}
      {layerColumn}
    </div>
  )

  if (sections.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {body}
        {scriptHint}
        {layerHint}
        {polishHint}
        {layers.lyrics.trim() && (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>
              Start a line with a section name — e.g.{' '}
              <span className="font-mono">[Verse 1]</span> or{' '}
              <span className="font-mono">Chorus:</span> — to get draggable
              section labels.
            </span>
            {onLabelSections !== undefined && paragraphs.length > 1 && (
              <button
                type="button"
                className="text-primary underline underline-offset-2 disabled:opacity-60"
                disabled={labellingSections}
                onClick={onLabelSections}
                title="Read the song and name each paragraph — Verse 1, Chorus, Bridge"
              >
                {labellingSections ? 'Labelling…' : 'Label them for me'}
              </button>
            )}
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
        {body}
        {scriptHint}
        {layerHint}
        {polishHint}
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
