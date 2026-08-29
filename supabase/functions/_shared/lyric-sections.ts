// Lyrics → slide-ready sections for the projection API (issue #135).
//
// Deno port of the header grammar in src/features/services/lyric-sections.ts —
// keep the keyword vocabulary and HEADER_RE in sync with that file. The app
// version returns character offsets for splice editing; this one returns the
// {type, label, lines[]} shape the projection API serves, so the two diverge
// on purpose below the parsing layer.

export interface ApiLyricSection {
  /** Lower-case section keyword ('verse', 'pre-chorus', …) or 'other'. */
  type: string
  /** Human display label ('Verse 1'), or null for an unlabeled stanza. */
  label: string | null
  /** Non-blank lyric lines, pre-split for slide chunking. */
  lines: string[]
  /** Line-parallel native / meaning / chord text, when the song has any (#139). */
  layers?: ApiLyricLayers
}

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
// in []/(), optionally numbered ("Verse 1") or lettered ("Verse A"), optional
// trailing colon. Identical grammar to the app-side parser.
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

export function matchHeader(line: string): { label: string; type: string } | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  let kind = m[1].toLowerCase()
  if (/^pre[\s-]?chorus$/.test(kind)) kind = 'pre-chorus'
  const designator = m[2] ?? m[3]?.toUpperCase()
  const label = designator ? `${titleCase(kind)} ${designator}` : titleCase(kind)
  return { label, type: kind }
}


/** One line of lyrics with whatever the other layers say about it (#139). */
export interface ApiLyricLayers {
  /** Original-script text, one entry per `lines` entry. */
  native?: string[]
  /** English gloss, one entry per `lines` entry. */
  meaning?: string[]
  /** Chords for the line, one entry per `lines` entry. */
  chords?: string[]
}

/** The four stored texts, as they come off song_arrangement_lyrics. */
export interface LyricLayerColumns {
  lyrics_native: string | null
  lyrics_meaning: string | null
  lyrics_chords: string | null
}

/** A lyric line together with its index in the original text. */
interface SourceLine {
  text: string
  index: number
}

function splitSourceLines(text: string): SourceLine[] {
  return text.split('\n').map((text, index) => ({ text, index }))
}

/** Blank-line-separated stanzas as unlabeled sections. */
function stanzaSections(lines: SourceLine[]): Array<ApiLyricSection & { indices: number[] }> {
  const sections: Array<ApiLyricSection & { indices: number[] }> = []
  let current: SourceLine[] = []
  const flush = () => {
    if (current.length === 0) return
    sections.push({
      type: 'other',
      label: null,
      lines: current.map((l) => l.text.trim()),
      indices: current.map((l) => l.index),
    })
    current = []
  }
  for (const line of lines) {
    if (line.text.trim() === '') flush()
    else current.push(line)
  }
  flush()
  return sections
}

/**
 * Split raw lyrics into API sections. Header lines ('[Verse 1]', 'Chorus:')
 * open a labeled section; text before the first header — or the whole text
 * when there are no headers — falls back to unlabeled stanza sections, so the
 * result is non-empty whenever the lyrics contain any content.
 *
 * `layers` attaches the native / meaning / chord texts (#139). They are
 * line-parallel to `raw`, so each section carries the layer entries for exactly
 * the lines it kept — blank lines are dropped from `lines`, and the same lines
 * are dropped from every layer, so the arrays stay the same length and index
 * against each other.
 */
export function toApiSections(
  raw: string | null | undefined,
  layers?: LyricLayerColumns | null,
): ApiLyricSection[] {
  if (!raw || !raw.trim()) return []
  const text = raw.replace(/\r\n/g, '\n')
  const lines = splitSourceLines(text)

  const sections: Array<ApiLyricSection & { indices: number[] }> = []
  let preamble: SourceLine[] = []
  let current: (ApiLyricSection & { indices: number[] }) | null = null

  for (const line of lines) {
    const header = matchHeader(line.text)
    if (header) {
      if (!current && preamble.length) {
        sections.push(...stanzaSections(preamble))
        preamble = []
      }
      current = { type: header.type, label: header.label, lines: [], indices: [] }
      sections.push(current)
      continue
    }
    const trimmed = line.text.trim()
    if (current) {
      if (trimmed) {
        current.lines.push(trimmed)
        current.indices.push(line.index)
      }
    } else {
      preamble.push(line)
    }
  }

  const result = !current
    ? stanzaSections(lines)
    : sections.filter((s) => s.label !== null || s.lines.length > 0)

  return result.map(({ indices, ...section }) =>
    attachLayers(section, indices, layers),
  )
}

/**
 * Pick each layer's entries for the lines a section kept. A layer that is empty
 * — or blank on every line of this section — is left off entirely rather than
 * shipped as an array of empty strings.
 */
function attachLayers(
  section: ApiLyricSection,
  indices: number[],
  layers: LyricLayerColumns | null | undefined,
): ApiLyricSection {
  if (!layers) return section
  // Chords are positioned by column, so their leading spaces are meaningful and
  // only trailing padding is dropped. Native text and the gloss are prose.
  const pick = (raw: string | null, keepIndent = false): string[] | undefined => {
    if (!raw || !raw.trim()) return undefined
    const all = raw.replace(/\r\n/g, '\n').split('\n')
    const picked = indices.map((i) => {
      const entry = all[i] ?? ''
      return keepIndent ? entry.replace(/\s+$/, '') : entry.trim()
    })
    return picked.some((entry) => entry !== '') ? picked : undefined
  }
  const native = pick(layers.lyrics_native)
  const meaning = pick(layers.lyrics_meaning)
  const chords = pick(layers.lyrics_chords, true)
  if (!native && !meaning && !chords) return section
  return {
    ...section,
    layers: {
      ...(native ? { native } : {}),
      ...(meaning ? { meaning } : {}),
      ...(chords ? { chords } : {}),
    },
  }
}
