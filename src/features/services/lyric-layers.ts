/**
 * Multi-lingual lyric layers (issue #139).
 *
 * A song's lyrics are four parallel texts. `lyrics` is the primary singable
 * text in Latin script — the transliteration for a multi-lingual song, simply
 * the lyrics for an English one — and it alone owns the section headers
 * ("[Verse 1]") and the line structure. The other three are line-parallel to
 * it: **line N of every layer belongs to line N of `lyrics`**, with blank rows
 * where a line has no annotation.
 *
 * That invariant is what lets the structure editor reorder a chorus and carry
 * its native text, meaning and chords along with it. It is maintained by
 * padding shorter layers to the base's line count on save (`padLayers`) and by
 * routing every section splice through the operations below, which apply one
 * line-range permutation identically to all four texts.
 *
 * These splices replace the earlier character-offset versions in
 * `lyric-sections.ts`. Working in whole lines is what makes the four texts stay
 * in step — and it drops the need for the old blank-line separator fix-up,
 * because joining lines can never glue two sections together the way splicing
 * a chunk that lacked a trailing newline could.
 */

import type { LyricSection } from '@/features/services/lyric-sections'

export const LYRIC_LAYER_KEYS = ['native', 'meaning', 'chords'] as const

/** The three layers that sit alongside the base `lyrics` text. */
export type LyricLayerKey = (typeof LYRIC_LAYER_KEYS)[number]

export interface LayeredLyrics {
  /** Primary singable text, Latin script. Owns headers and line structure. */
  lyrics: string
  /** Original script — Malayalam, Hindi … */
  native: string
  /** English gloss. */
  meaning: string
  /** Chords; rendered above the line in read views. */
  chords: string
}

export const EMPTY_LAYERS: LayeredLyrics = {
  lyrics: '',
  native: '',
  meaning: '',
  chords: '',
}

export const LAYER_LABELS: Record<LyricLayerKey, string> = {
  native: 'Native',
  meaning: 'Meaning',
  chords: 'Chord',
}

/** Every key in display order, base first. */
const ALL_KEYS = ['lyrics', ...LYRIC_LAYER_KEYS] as const

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n')

/**
 * Lines of `text`, or [] when empty. A trailing newline yields a final empty
 * element, so `toLines`/`join` is a byte-exact round trip for both LF and CRLF.
 */
export function toLines(text: string): string[] {
  return text === '' ? [] : text.split(/\r?\n/)
}

/** Number of lines, counting a trailing newline's empty final line. */
export function lineCount(text: string): number {
  return toLines(text).length
}

/** True when any layer beyond the base carries text. */
export function hasAnyLayer(layers: LayeredLyrics): boolean {
  return LYRIC_LAYER_KEYS.some((key) => layers[key].trim() !== '')
}

/**
 * Pad every non-empty layer with blank lines up to the base's line count, so
 * line N lines up across all four. A layer that is empty stays empty — an
 * unused layer is never materialised as a column of blanks. A layer that is
 * *longer* than the base is left alone rather than truncated: losing the user's
 * text to enforce an invariant is the wrong trade, and `layerLineMismatch`
 * surfaces the drift instead.
 */
export function padLayers(layers: LayeredLyrics): LayeredLyrics {
  let padded = layers
  for (const key of LYRIC_LAYER_KEYS) {
    if (layers[key] === '') continue
    padded = alignLayer(padded, key)
  }
  return padded
}

/**
 * Fill one layer out to the base's line count. Unlike `padLayers` this seeds an
 * empty layer too, so the editor can offer it as an explicit "add the missing
 * blank lines" action — the user asked for the rows, so materialising them is
 * what they wanted, where doing it on save would be surprising.
 */
export function alignLayer(
  layers: LayeredLyrics,
  key: LyricLayerKey,
): LayeredLyrics {
  const base = lineCount(layers.lyrics)
  const lines = toLines(layers[key])
  if (lines.length >= base) return layers
  const blanks = Array<string>(base - lines.length).fill('')
  return { ...layers, [key]: [...lines, ...blanks].join(eolOf(layers.lyrics)) }
}

/**
 * Layers whose line count differs from the base's, for the editor's drift
 * badge. Empty layers are not drift — they are simply unused.
 */
export function layerLineMismatch(
  layers: LayeredLyrics,
): Array<{ key: LyricLayerKey; lines: number; baseLines: number }> {
  const baseLines = lineCount(layers.lyrics)
  return LYRIC_LAYER_KEYS.filter((key) => layers[key] !== '')
    .map((key) => ({ key, lines: lineCount(layers[key]), baseLines }))
    .filter((m) => m.lines !== m.baseLines)
}

/** Read the four layers off a stored lyrics row (or a missing one). */
export function layersOfRow(
  row: {
    lyrics: string
    lyrics_native: string | null
    lyrics_meaning: string | null
    lyrics_chords: string | null
  } | null,
): LayeredLyrics {
  if (!row) return EMPTY_LAYERS
  return {
    lyrics: row.lyrics,
    native: row.lyrics_native ?? '',
    meaning: row.lyrics_meaning ?? '',
    chords: row.lyrics_chords ?? '',
  }
}

/**
 * Normalise the editor buffer for saving.
 *
 * With no layers in use this is the long-standing behaviour — trim the lyrics
 * and store nothing else. Once a layer carries text, trimming the base would
 * shift it against the layers, so the base is left exactly as typed and the
 * layers are padded out to match it instead.
 */
export function normalizeForSave(layers: LayeredLyrics): LayeredLyrics {
  if (!hasAnyLayer(layers)) {
    return { ...EMPTY_LAYERS, lyrics: layers.lyrics.trim() }
  }
  return padLayers(layers)
}

export interface LyricLineTuple {
  /** Base line — the singable text. */
  text: string
  native: string
  meaning: string
  chords: string
}

/**
 * Zip the four texts into per-line tuples for read views (plan, lyrics sheet,
 * projection API). Driven by the base, so a longer layer's extra lines are
 * ignored here — they show up in the editor, where they can be fixed.
 */
export function zipLyricLines(layers: LayeredLyrics): LyricLineTuple[] {
  const base = toLines(layers.lyrics)
  const native = toLines(layers.native)
  const meaning = toLines(layers.meaning)
  const chords = toLines(layers.chords)
  return base.map((text, i) => ({
    text,
    native: native[i] ?? '',
    meaning: meaning[i] ?? '',
    chords: chords[i] ?? '',
  }))
}

/** One run of a chord line: either a bracketed chord, or the text around it. */
export interface ChordSegment {
  /** True for a `[…]` token; its text is the chord name, brackets stripped. */
  chord: boolean
  text: string
}

/** A `[…]` chord token: no nested bracket, no newline, never empty. */
const CHORD_TOKEN = /\[([^\][\n]+)\]/g

/**
 * Split a chord line into its bracketed chords and the text between them
 * (ChordPro notation).
 *
 * The chord layer used to position chords by counting spaces, which forced the
 * whole sheet into a monospace face. Brackets carry that placement instead, so
 * both conventions now read correctly in a proportional font: a bare chord row
 * (`[G] [C]`) or a full ChordPro line (`[G]Amazing [C]grace`).
 *
 * An unclosed or empty bracket is not a chord — it stays plain text, so a
 * half-typed line never flickers between styles as it is written.
 */
export function splitChordLine(line: string): ChordSegment[] {
  const segments: ChordSegment[] = []
  let cursor = 0
  for (const match of line.matchAll(CHORD_TOKEN)) {
    const start = match.index ?? cursor
    if (start > cursor) segments.push({ chord: false, text: line.slice(cursor, start) })
    segments.push({ chord: true, text: match[1] })
    cursor = start + match[0].length
  }
  if (cursor < line.length) segments.push({ chord: false, text: line.slice(cursor) })
  return segments
}

/**
 * A section's half-open line range within the base text. Offsets come from
 * `parseLyricSections`, which reads the base alone.
 */
interface LineRange {
  start: number
  end: number
}

/** Map character offsets to line indices in one pass over the base text. */
function lineRangesOf(base: string, sections: LyricSection[]): LineRange[] {
  const lineStarts: number[] = [0]
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] === '\n') lineStarts.push(i + 1)
  }
  const lineOf = (offset: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  // A section's `end` is the next header's start — already a line start, so it
  // reads directly as an exclusive line index. The final section instead ends
  // at text.length, which is one past the last line rather than the start of a
  // new one, so it maps to the line count.
  const endLineOf = (offset: number) =>
    offset >= base.length ? lineStarts.length : lineOf(offset)
  return sections.map((s) => ({ start: lineOf(s.start), end: endLineOf(s.end) }))
}

/**
 * Split one layer's lines into [preamble, ...section chunks, tail] using line
 * ranges derived from the base. A layer shorter than the base yields short or
 * empty chunks; anything past the last section falls into the tail, which is
 * how a longer-than-base layer keeps its extra lines.
 */
function chunk(
  lines: string[],
  ranges: LineRange[],
): { preamble: string[]; chunks: string[][]; tail: string[] } {
  const first = ranges[0]?.start ?? 0
  const last = ranges[ranges.length - 1]?.end ?? 0
  return {
    preamble: lines.slice(0, first),
    chunks: ranges.map((r) => lines.slice(r.start, r.end)),
    tail: lines.slice(last),
  }
}

/**
 * Apply one section-chunk rearrangement to all four layers at once. `rebuild`
 * receives a layer's section chunks and returns them in their new shape; the
 * same function runs over every layer, which is what keeps them aligned.
 */
function spliceLayers(
  layers: LayeredLyrics,
  sections: LyricSection[],
  rebuild: (chunks: string[][]) => string[][],
): LayeredLyrics {
  if (sections.length === 0) return layers
  const ranges = lineRangesOf(layers.lyrics, sections)
  const eol = eolOf(layers.lyrics)

  // A section keeps whatever blank lines trailed it, so chunks normally end
  // with their own separator. The last section has none — when it lands
  // mid-text it would run straight into the next header, so it gets a blank
  // line appended. The decision is made once from the base and applied to the
  // same chunk in every layer, so all four gain the line together and stay in
  // step.
  const baseChunks = rebuild(chunk(toLines(layers.lyrics), ranges).chunks)
  const padAfter = baseChunks.map(
    (c, i) => i < baseChunks.length - 1 && (c[c.length - 1] ?? '') !== '',
  )

  const next = { ...layers }
  for (const key of ALL_KEYS) {
    const text = layers[key]
    if (text === '') continue
    const { preamble, chunks, tail } = chunk(toLines(text), ranges)
    const rearranged = rebuild(chunks).map((c, i) => (padAfter[i] ? [...c, ''] : c))
    next[key] = [...preamble, ...rearranged.flat(), ...tail].join(eol)
  }
  return next
}

/** Move the section at `from` to position `to` (arrayMove semantics). */
export function moveSectionLayers(
  layers: LayeredLyrics,
  sections: LyricSection[],
  from: number,
  to: number,
): LayeredLyrics {
  if (from === to || !sections[from] || !sections[to]) return layers
  return spliceLayers(layers, sections, (chunks) => {
    const next = [...chunks]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  })
}

/** Insert a copy of the section directly after itself. */
export function duplicateSectionLayers(
  layers: LayeredLyrics,
  sections: LyricSection[],
  index: number,
): LayeredLyrics {
  if (!sections[index]) return layers
  return spliceLayers(layers, sections, (chunks) => {
    const next = [...chunks]
    next.splice(index, 0, [...chunks[index]])
    return next
  })
}

/** Remove the section (its header line and its lyrics) from every layer. */
export function removeSectionLayers(
  layers: LayeredLyrics,
  sections: LyricSection[],
  index: number,
): LayeredLyrics {
  if (!sections[index]) return layers
  return spliceLayers(layers, sections, (chunks) =>
    chunks.filter((_, i) => i !== index),
  )
}
