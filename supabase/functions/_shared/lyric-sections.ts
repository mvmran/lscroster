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

function matchHeader(line: string): { label: string; type: string } | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  let kind = m[1].toLowerCase()
  if (/^pre[\s-]?chorus$/.test(kind)) kind = 'pre-chorus'
  const designator = m[2] ?? m[3]?.toUpperCase()
  const label = designator ? `${titleCase(kind)} ${designator}` : titleCase(kind)
  return { label, type: kind }
}

/** Blank-line-separated stanzas as unlabeled sections. */
function stanzaSections(text: string): ApiLyricSection[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) => ({ type: 'other', label: null, lines }))
}

/**
 * Split raw lyrics into API sections. Header lines ('[Verse 1]', 'Chorus:')
 * open a labeled section; text before the first header — or the whole text
 * when there are no headers — falls back to unlabeled stanza sections, so the
 * result is non-empty whenever the lyrics contain any content.
 */
export function toApiSections(raw: string | null | undefined): ApiLyricSection[] {
  if (!raw || !raw.trim()) return []
  const text = raw.replace(/\r\n/g, '\n')
  const lines = text.split('\n')

  const sections: ApiLyricSection[] = []
  let preamble: string[] = []
  let current: ApiLyricSection | null = null

  for (const line of lines) {
    const header = matchHeader(line)
    if (header) {
      if (!current && preamble.length) {
        sections.push(...stanzaSections(preamble.join('\n')))
        preamble = []
      }
      current = { type: header.type, label: header.label, lines: [] }
      sections.push(current)
      continue
    }
    const trimmed = line.trim()
    if (current) {
      if (trimmed) current.lines.push(trimmed)
    } else {
      preamble.push(line)
    }
  }

  if (!current) return stanzaSections(text)
  return sections.filter((s) => s.label !== null || s.lines.length > 0)
}
