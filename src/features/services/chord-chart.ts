/**
 * Chord charts pasted as chords above the words.
 *
 * Nearly every chord chart on the internet is written this way: a row of
 * chords whose *column* says which syllable each one falls on, and the lyric
 * line directly beneath it.
 *
 * ```
 *        D         D7        G        D
 * T'was grace that taught my heart to fear
 * ```
 *
 * The app stores chords in ChordPro instead — the chord bracketed against the
 * syllable it belongs to — because a column only means something in a
 * monospaced face, and the read views and the printed sheet are proportional
 * (see `lyrics-read-view`). The two formats hold the same information, so a
 * paste is converted once, on the way in: `D` at column 7 is inserted at index
 * 7 of the line below, giving `T'was g[D]race`. Nothing is guessed and nothing
 * is lost — reading the brackets back out reproduces the lyric exactly.
 *
 * The conversion is in two halves because the import pipeline sits between
 * them. `mergeChordRows` folds each chord row into the line beneath it, so the
 * text that goes through `parseImportedLyrics` has one line per lyric line and
 * sections, keywords and padding all work unchanged. `splitInlineChords` then
 * lifts the chords back out of the assembled base text into the parallel
 * `chords` layer, which is where they are stored.
 */

import { isChordToken, isLetterChord } from '@/features/services/chord-notation'
import {
  splitChordLine,
  toLines,
  type ChordSegment,
} from '@/features/services/lyric-layers'
import { matchLyricSectionHeader } from '@/features/services/lyric-sections'

/** One chord of a chord row, and the column it was written at. */
interface PlacedChord {
  col: number
  text: string
}

/**
 * The chords of a chord row, or null when the line is words.
 *
 * A row qualifies only when *every* whitespace-separated token is a chord,
 * which is a far stronger test than it looks: the suffix whitelist in
 * `chord-notation` means "Add", "Dad", "Amen" and "Cabbage" all fail on their
 * second letter, so an ordinary lyric line is rejected by its first word.
 *
 * A line that already carries brackets is never a chord row. That is what
 * makes the merge idempotent — once folded in, a line can't be folded again.
 */
function chordRow(line: string): PlacedChord[] | null {
  if (line.includes('[') || line.includes(']')) return null
  const found: PlacedChord[] = []
  for (const match of line.matchAll(/\S+/g)) {
    if (!isLetterChord(match[0])) return null
    found.push({ col: match.index ?? 0, text: match[0] })
  }
  return found.length === 0 ? null : found
}

/** A line with words on it for a chord row to attach to. */
function isLyricLine(line: string | undefined): boolean {
  return (
    line !== undefined &&
    line.trim() !== '' &&
    chordRow(line) === null &&
    matchLyricSectionHeader(line) === null
  )
}

/**
 * Is a single letter on its own line a chord, or is it a word?
 *
 * "A" is both, and nothing about the line itself settles it. What does settle
 * it is the rest of the paste: a chart that indents one bare `D` over a line
 * always has an unambiguous row somewhere else — two chords, or one with a
 * suffix. Without such a row the paste is read as lyrics throughout, so plain
 * words are never quietly turned into chords.
 */
function hasUnambiguousRow(lines: string[]): boolean {
  return lines.some((line) => {
    const chords = chordRow(line)
    return (
      chords !== null &&
      (chords.length > 1 || chords.some((chord) => chord.text.length > 1))
    )
  })
}

/** Insert each chord at its column, padding a line too short to reach one. */
function place(chords: PlacedChord[], lyric: string): string {
  let out = lyric
  // Right to left: an insertion shifts everything after it, and nothing
  // before it, so the columns still to be used stay where they were measured.
  for (const { col, text } of [...chords].reverse()) {
    out = `${out.slice(0, col).padEnd(col)}[${text}]${out.slice(col)}`
  }
  return out.trimEnd()
}

/**
 * Fold every chord row into the lyric line beneath it, as ChordPro.
 *
 * A row with no lyric under it — an intro, a turnaround, the chords over a
 * repeat — keeps its own line and is simply bracketed where it stands, so it
 * survives as a bare chord row rather than being dropped or attached to a line
 * it does not belong to.
 */
export function mergeChordRows(text: string): string {
  const lines = toLines(text)
  const trustSingles = hasUnambiguousRow(lines)
  const out: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const chords = chordRow(lines[i])
    const ambiguous =
      chords !== null &&
      chords.length === 1 &&
      chords[0].text.length === 1 &&
      !trustSingles
    if (chords === null || ambiguous) {
      out.push(lines[i])
      continue
    }
    const lyric = isLyricLine(lines[i + 1]) ? lines[i + 1] : null
    out.push(place(chords, lyric ?? ''))
    if (lyric !== null) i += 1
  }
  return out.join('\n')
}

/**
 * Drop the same leading whitespace from a chord line that was dropped from its
 * words, so the two lines stay the same text apart from the chords.
 *
 * A chart indents to put a chord over the right syllable — `[Bm]  You call me`
 * — and once the chord is a bracket rather than a column, that padding is
 * meaningless. The words lose it, so the chord line has to lose exactly as
 * much or the two disagree: read views draw the chord line *in place of* the
 * lyric when it carries words, and the line would jump left as chords are
 * switched off. Chords are stepped over rather than counted, which is what
 * keeps every chord against the syllable it was anchored to.
 */
function dropIndent(segments: ChordSegment[], count: number): string {
  let left = count
  return segments
    .map((segment) => {
      if (segment.chord) return `[${segment.text}]`
      if (left === 0) return segment.text
      const spaces = segment.text.length - segment.text.trimStart().length
      const cut = Math.min(spaces, left)
      left -= cut
      return segment.text.slice(cut)
    })
    .join('')
}

/**
 * Lift inline chords out of a text into a line-parallel chord layer.
 *
 * The base keeps the words alone, so plain lyrics — the projection feed, a
 * sheet with chords switched off — are unaffected by a chart having been
 * imported. The chord layer keeps the *whole* line, words included, because
 * the words are what hold each chord against its syllable; read views render
 * that line in place of the lyric rather than above it.
 *
 * Only a bracketed token that parses as a chord is moved. `[Verse 1]` and
 * `[x2]` are notes to the band and stay in the base where they were typed.
 */
export function splitInlineChords(text: string): { lyrics: string; chords: string } {
  const lyrics: string[] = []
  const chords: string[] = []
  let found = false

  for (const line of toLines(text)) {
    const segments = splitChordLine(line)
    const isChord = (segment: (typeof segments)[number]) =>
      segment.chord && isChordToken(segment.text)
    if (!segments.some(isChord)) {
      lyrics.push(line.trimStart())
      chords.push('')
      continue
    }
    found = true
    const words = segments
      .filter((segment) => !isChord(segment))
      .map((segment) => (segment.chord ? `[${segment.text}]` : segment.text))
      .join('')
    // A bare row of chords has no words to indent, and its spacing is what
    // separates one chord from the next — dropping it runs them together.
    const indent =
      words.trim() === '' ? 0 : words.length - words.trimStart().length
    chords.push(dropIndent(segments, indent))
    lyrics.push(words.slice(indent).trimEnd())
  }

  return { lyrics: lyrics.join('\n'), chords: found ? chords.join('\n') : '' }
}
