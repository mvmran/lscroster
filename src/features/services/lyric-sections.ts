/**
 * Lyrics structure parsing (verse / chorus / bridge …).
 *
 * The raw lyrics string is the single source of truth: sections are derived
 * on every render from header lines the team already types (e.g. "[Verse 1]",
 * "Chorus:", "PRE-CHORUS 2") and are never persisted. Only the base `lyrics`
 * text is parsed — it decides where the sections begin. The native, meaning and
 * chord layers are line-parallel to it and may repeat the same header on the
 * same row, which keeps them in step; read views show it once.
 *
 * Each section carries character offsets into the original string. The
 * reorder / duplicate / delete operations that consume them live in
 * `lyric-layers.ts`, which converts these offsets to line ranges so one
 * rearrangement can be applied to all four layers at once.
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

/**
 * "REPEAT CHORUS" — a chart telling you to sing a section again rather than
 * printing it twice.
 *
 * A widespread convention, and one nothing else here understands: the line is
 * not a header, so it lands among the words and is sung. `expandRepeatMarkers`
 * replaces it with the section it names. An explicit designator is honoured
 * ("REPEAT VERSE 2"), and a trailing count is tolerated and ignored — how many
 * times to sing it is the band's business, not the text's.
 */
export const REPEAT_MARKER_RE = new RegExp(
  `^\\s*repeat\\s+(${KEYWORD_PATTERN})(?:\\s+(\\d{1,2}))?(?:\\s*[x×]\\s*\\d{1,2}|\\s*\\d{1,2}\\s*[x×])?\\s*:?\\s*$`,
  'i',
)

// A header line is a section keyword alone on its line — optionally wrapped
// in []/(), optionally numbered ("Verse 1", "Verse1") or lettered ("Verse A",
// space required so lyric words like "Chorusa" can't match), optional colon.
// A repeat count after the designator: "Bridge 1 X3", "Chorus x2", "Verse 2x",
// "(x3)". Charts write how many times a section is sung as part of its heading,
// and a heading we don't recognise is worse than useless — it lands in the
// lyrics as a line to sing, and every line under it joins the section above.
// Either order of the count and its "x" is accepted, and "×" as well as "x".
const REPEAT_PATTERN =
  '\\(?\\s*(?:[x×]\\s*(\\d{1,2})|(\\d{1,2})\\s*[x×])\\s*\\)?'

const HEADER_RE = new RegExp(
  `^\\s*[\\[(]?\\s*(${KEYWORD_PATTERN})(?:\\s*(\\d{1,2})|\\s+([A-Da-d]))?` +
    `(?:\\s*${REPEAT_PATTERN})?\\s*[\\])]?\\s*:?\\s*$`,
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
export function matchLyricSectionHeader(line: string): {
  label: string
  short: string
  kind: string
  /** The section's number or letter — "1" of "Verse 1" — or null. */
  designator: string | null
  /** How many times it is sung, when the heading says. */
  repeat: number | null
} | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  let kind = m[1].toLowerCase()
  if (/^pre[\s-]?chorus$/.test(kind)) kind = 'pre-chorus'
  const designator = m[2] ?? m[3]?.toUpperCase() ?? null
  const repeat = m[4] ?? m[5]
  const named = designator ? `${titleCase(kind)} ${designator}` : titleCase(kind)
  // The repeat rides on the full label but not on the pill: the pill is one to
  // three characters by design, and "which bridge" is what it is there to say.
  const label = repeat ? `${named} ×${repeat}` : named
  const short = `${KIND_ABBREVIATIONS[kind] ?? kind.charAt(0).toUpperCase()}${designator ?? ''}`
  return { label, short, kind, designator, repeat: repeat ? Number(repeat) : null }
}

/**
 * Split lyrics into sections. Returns [] when no header lines are present
 * (the UI then falls back to a plain textarea). Non-blank text before the
 * first header becomes an "Unlabeled" section so no content can be lost by
 * a reorder; blank leading whitespace is instead preserved as a preamble by
 * the splice helpers in `lyric-layers.ts`.
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
