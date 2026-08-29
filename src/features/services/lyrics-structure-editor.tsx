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
  type LayeredLyrics,
  type LyricLayerKey,
} from '@/features/services/lyric-layers'
import { parseLyricSections, type LyricSection } from '@/features/services/lyric-sections'
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
}: {
  id?: string
  layers: LayeredLyrics
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
}) {
  const sections = useMemo(() => parseLyricSections(layers.lyrics), [layers.lyrics])
  // Only offered where there is more than one paragraph to tell apart: a single
  // "Verse 1" over the whole song is structure in name alone.
  const paragraphs = useMemo(() => lyricParagraphs(layers.lyrics), [layers.lyrics])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rects = useSectionRects(textareaRef, layers.lyrics, sections)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )
  const split = activeLayer !== null

  const indexOfId = (dndId: string | number) => Number(String(dndId).slice(2))

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

  const baseTextarea = (
    <Textarea
      id={id}
      ref={textareaRef}
      rows={6}
      wrap={split ? 'off' : undefined}
      value={layers.lyrics}
      onChange={(e) => onChange({ ...layers, lyrics: e.target.value })}
      className={cn(
        // Proportional, like every other lyric surface — chords are
        // placed by their brackets now, so no pane needs a monospace grid.
        'font-sans text-sm',
        sections.length > 0 && 'pl-5',
        split && `${PANE_LEADING} whitespace-pre`,
      )}
    />
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
      <div className="min-w-0 flex-1">{baseTextarea}</div>
    </div>
  )

  const layerColumn = activeLayer && (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <LineNumbers count={lineCount(layers[activeLayer])} />
      <div className="min-w-0 flex-1">
        <Textarea
          rows={6}
          wrap="off"
          aria-label={`${LAYER_LABELS[activeLayer]} text, line by line against the lyrics`}
          value={layers[activeLayer]}
          onChange={(e) => onChange({ ...layers, [activeLayer]: e.target.value })}
          className={cn('text-sm whitespace-pre font-sans', PANE_LEADING)}
        />
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
              Wrap each chord in brackets — <span className="font-mono">[G]</span> on
              its own, or <span className="font-mono">[G]Amazing</span> ChordPro
              style — and it is picked out above the line.
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

  // Offered from the native pane, because that is the text it reads — and only
  // once there is both a script to read and a line to rewrite.
  const polishHint = activeLayer === 'native' &&
    onPolishTransliteration !== undefined &&
    layers.native.trim() !== '' &&
    layers.lyrics.trim() !== '' && (
      <p className="text-muted-foreground text-xs">
        <button
          type="button"
          className="text-primary underline underline-offset-2 disabled:opacity-60"
          disabled={polishingTransliteration}
          onClick={onPolishTransliteration}
        >
          {polishingTransliteration ? 'Polishing…' : 'Polish the transliteration'}
        </button>{' '}
        — the lyrics pane is rewritten from this script, spelled the way a
        singer would read it aloud. Nothing is saved until you press Save
        changes.
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
