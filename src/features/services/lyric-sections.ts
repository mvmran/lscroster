/**
 * Lyrics structure parsing (verse / chorus / bridge …).
 *
 * The raw lyrics string is the single source of truth: sections are derived
 * on every render from header lines the team already types (e.g. "[Verse 1]",
 * "Chorus:", "PRE-CHORUS 2") and are never persisted. Each section carries
 * character offsets into the original string, so the reorder / duplicate /
 * delete operations below are pure string splices — text outside the spliced
 * region survives byte-for-byte, including CRLF line endings and chord-chart
 * fragments pasted from the web.
 */

export interface LyricSection {
  /** Normalised display label, e.g. "Verse 1" or "Unlabeled". */
  label: string
  /** Compact 1–3 char label for tight UI, e.g. "V1", "PC", "C". */
  short: string
  /** Lower-case section keyword ("verse", "chorus", …) or "unlabeled". */
  kind: string
  /** Offset of the section's first character (its header line, if any). */
  start: number
  /** Offset just past the header line's newline (= start when unlabeled). */
  bodyStart: number
  /** Exclusive end offset (start of the next header, or end of text). */
  end: number
}

/**
 * Section vocabulary follows the Planning Center / Ultimate Guitar
 * conventions so lyrics stay compatible with ChordSheetJS's
 * UltimateGuitarParser should chords/transposition be added later.
 */
const KEYWORD_PATTERN = [
  'pre[\\s-]?chorus',
  'verse',
  'chorus',
  'bridge',
  'intro',
  'outro',
  'tag',
  'refrain',
  'interlude',
  'instrumental',
  'ending',
  'vamp',
  'turnaround',
  'coda',
  'hook',
  'reprise',
  'breakdown',
  'channel',
  'descant',
].join('|')

// A header line is a section keyword alone on its line — optionally wrapped
// in []/(), optionally numbered ("Verse 1", "Verse1") or lettered ("Verse A",
// space required so lyric words like "Chorusa" can't match), optional colon.
const HEADER_RE = new RegExp(
  `^\\s*[\\[(]?\\s*(${KEYWORD_PATTERN})(?:\\s*(\\d{1,2})|\\s+([A-Da-d]))?\\s*[\\])]?\\s*:?\\s*$`,
  'i',
)

function titleCase(kind: string): string {
  return kind
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-')
}

const KIND_ABBREVIATIONS: Record<string, string> = {
  verse: 'V',
  chorus: 'C',
  'pre-chorus': 'PC',
  bridge: 'B',
  intro: 'I',
  outro: 'O',
  tag: 'T',
  refrain: 'R',
  interlude: 'IL',
  instrumental: 'IN',
  ending: 'E',
  vamp: 'VA',
  turnaround: 'TU',
  coda: 'CO',
  hook: 'H',
  reprise: 'RE',
  breakdown: 'BR',
  channel: 'CH',
  descant: 'DS',
}

/** Match one line against the header grammar; null when it's lyric content. */
export function matchLyricSectionHeader(
  line: string,
): { label: string; short: string; kind: string } | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  let kind = m[1].toLowerCase()
  if (/^pre[\s-]?chorus$/.test(kind)) kind = 'pre-chorus'
  const designator = m[2] ?? m[3]?.toUpperCase()
  const label = designator ? `${titleCase(kind)} ${designator}` : titleCase(kind)
  const short = `${KIND_ABBREVIATIONS[kind] ?? kind.charAt(0).toUpperCase()}${designator ?? ''}`
  return { label, short, kind }
}

/**
 * Split lyrics into sections. Returns [] when no header lines are present
 * (the UI then falls back to a plain textarea). Non-blank text before the
 * first header becomes an "Unlabeled" section so no content can be lost by
 * a reorder; blank leading whitespace is instead preserved as a preamble by
 * the splice helpers.
 */
export function parseLyricSections(text: string): LyricSection[] {
  if (!text) return []
  const headers: Array<Omit<LyricSection, 'end'>> = []
  let lineStart = 0
  while (lineStart <= text.length) {
    let lineEnd = text.indexOf('\n', lineStart)
    const isLastLine = lineEnd === -1
    if (isLastLine) lineEnd = text.length
    const match = matchLyricSectionHeader(text.slice(lineStart, lineEnd))
    if (match) {
      headers.push({
        ...match,
        start: lineStart,
        bodyStart: Math.min(lineEnd + 1, text.length),
      })
    }
    if (isLastLine) break
    lineStart = lineEnd + 1
  }
  if (headers.length === 0) return []
  const sections: LyricSection[] = headers.map((h, i) => ({
    ...h,
    end: i + 1 < headers.length ? headers[i + 1].start : text.length,
  }))
  if (sections[0].start > 0 && text.slice(0, sections[0].start).trim()) {
    sections.unshift({
      label: 'Unlabeled',
      short: '•',
      kind: 'unlabeled',
      start: 0,
      bodyStart: 0,
      end: sections[0].start,
    })
  }
  return sections
}

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n')

/**
 * Move the section at `from` to position `to` (arrayMove semantics) and
 * return the new lyrics text. Untouched sections are reassembled from exact
 * substrings; only a chunk that lacked a trailing newline (the old final
 * section) gains a blank-line separator when it lands mid-text.
 */
export function moveLyricSection(
  text: string,
  sections: LyricSection[],
  from: number,
  to: number,
): string {
  if (from === to || !sections[from] || !sections[to]) return text
  const eol = eolOf(text)
  const preamble = text.slice(0, sections[0].start)
  const chunks = sections.map((s) => text.slice(s.start, s.end))
  const [moved] = chunks.splice(from, 1)
  chunks.splice(to, 0, moved)
  return (
    preamble +
    chunks
      .map((c, i) =>
        i < chunks.length - 1 && !/\r?\n$/.test(c) ? `${c}${eol}${eol}` : c,
      )
      .join('')
  )
}

/** Insert a copy of the section right after itself, blank-line separated. */
export function duplicateLyricSection(
  text: string,
  sections: LyricSection[],
  index: number,
): string {
  const s = sections[index]
  if (!s) return text
  const eol = eolOf(text)
  const chunk = text.slice(s.start, s.end)
  const sep = /\r?\n\r?\n$/.test(chunk) ? '' : /\r?\n$/.test(chunk) ? eol : eol + eol
  return text.slice(0, s.end) + sep + chunk + text.slice(s.end)
}

/** Remove the section (header line + its lyrics) from the text. */
export function removeLyricSection(
  text: string,
  sections: LyricSection[],
  index: number,
): string {
  const s = sections[index]
  if (!s) return text
  return text.slice(0, s.start) + text.slice(s.end)
}
