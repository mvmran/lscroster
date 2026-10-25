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
  /** Human display label ('Verse 1'), or null for an unlabelled stanza. */
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

export function matchHeader(
  line: string,
): { label: string; type: string; key: string } | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  let kind = m[1].toLowerCase()
  if (/^pre[\s-]?chorus$/.test(kind)) kind = 'pre-chorus'
  const designator = m[2] ?? m[3]?.toUpperCase()
  const repeat = m[4] ?? m[5]
  const named = designator ? `${titleCase(kind)} ${designator}` : titleCase(kind)
  return {
    label: repeat ? `${named} ×${repeat}` : named,
    type: kind,
    // Which section the heading names, as the app's `sectionKeyOf` reads it:
    // no designator is 1 — "Verse" and "Verse 1" are the same verse — and a
    // repeat count is ignored.
    key: `${kind}:${designator ?? '1'}`,
  }
}

/**
 * The song's sequence for the API (`songs[].sequence`): the order it is sung
 * in, each step the full `label` of a section in `sections`, so a client finds
 * a step's lines by plain string match. `sections` itself stays the whole song
 * as written, so the operator can still put up a part the sequence leaves out.
 *
 * `sequence` is the one the Lyrics Sheet reads: the plan's, else the one saved
 * with the lyrics version. A step takes the section with exactly its label
 * ("Chorus ×2" the "Chorus ×2", not an earlier "Chorus"), else the first with
 * its `key` ("Verse" finds "Verse 1"), and is dropped when it names neither. A
 * sequence left with no steps — out of date, its headings renamed since — gives
 * the headings in written order, the whole song, as the sheet prints it rather
 * than nothing. Empty only when the song has no headings at all; a section with
 * a `null` label is never a step.
 *
 * `sections` is the song as written (`toApiSections`), repeats and all, so a
 * stale sequence still gives every chorus in turn; each step is then named by
 * the section `uniqueSections` keeps for it — a later copy dropped as a repeat
 * by the first of its key, which is never dropped — so every name the API
 * sends has a section it sends.
 */
export function apiSequence(
  sections: ApiLyricSection[],
  sequence: string[] | null | undefined,
): string[] {
  const labels = new Set<string>()
  const labelByKey = new Map<string, string>()
  const written: string[] = []
  for (const { label } of sections) {
    if (label === null) continue
    written.push(label)
    labels.add(label)
    const key = matchHeader(label)?.key
    if (key && !labelByKey.has(key)) labelByKey.set(key, label)
  }
  const steps = (sequence ?? []).flatMap((step) => {
    const header = matchHeader(step)
    if (!header) return []
    const label = labels.has(header.label) ? header.label : labelByKey.get(header.key)
    return label ? [label] : []
  })
  const sung = steps.length > 0 ? steps : written
  const kept = new Set(
    uniqueSections(sections).flatMap(({ label }) => (label === null ? [] : [label])),
  )
  return sung.map((label) =>
    kept.has(label) ? label : (labelByKey.get(matchHeader(label)?.key ?? '') ?? label),
  )
}

// --- each section once ---------------------------------------------------------
// A port of the app's repeat rule (`withoutRepeatedSections` in
// src/features/services/lyric-layers.ts, over `sectionContent` / `sameSection`
// in lyric-sections.ts); lyric-sections.test.ts holds the two to the same
// answers.

/** A section's words as a singer reads them: chords, case, punctuation gone. */
function lyricWords(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\[[^\]]*\]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
}

/** The chords a section plays, line by line — "[6m]Ther[4]e" reads "6m 4". */
function lyricChords(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) =>
      [...line.matchAll(/\[([^\]]*)\]/g)]
        .map((match) => match[1].trim())
        .filter(Boolean)
        .join(' '),
    )
    .join('\n')
    .trim()
}

/**
 * What makes a section the same as another: its words *and* its chords, from
 * the lyrics (chords written into them count) and the chord layer beside them.
 * Empty for a heading over nothing — a cue to sing it again.
 */
export function sectionContent(body: string, chordLayer = ''): string {
  const words = lyricWords(body)
  const chords = lyricChords(`${body}\n${chordLayer}`)
  return words === '' && chords === '' ? '' : `${words}\u0001${chords}`
}

/**
 * Whether two contents are one section sung again: the same words over the
 * same chords, or over no chords on one of them — a chart writes a chorus's
 * chords out once and plays them every time it comes round.
 */
export function sameSection(a: string, b: string): boolean {
  if (a === b) return true
  if (a === '' || b === '') return false
  const at = (content: string) => content.indexOf('\u0001')
  const words = (content: string) => content.slice(0, at(content))
  const chords = (content: string) => content.slice(at(content) + 1)
  return words(a) === words(b) && (chords(a) === '' || chords(b) === '')
}

/**
 * The sections the API sends: each once. A labelled section is left out when
 * it repeats one already kept — the same heading ("Verse" and "Verse 1" alike)
 * over the same words and chords, or over nothing at all — as the Lyrics Sheet
 * leaves it out; the song's `sequence` says how often each comes round. The
 * first of each heading always stays. Two different sections under one heading
 * (a second chorus with new words) both stay, so a label is unique only when
 * the song's headings are. Unlabelled stanzas are never dropped.
 */
export function uniqueSections(sections: ApiLyricSection[]): ApiLyricSection[] {
  const shown = new Map<string, string[]>()
  return sections.filter((section) => {
    const key = section.label === null ? null : matchHeader(section.label)?.key
    if (!key) return true
    const content = sectionContent(
      section.lines.join('\n'),
      (section.layers?.chords ?? []).join('\n'),
    )
    const seen = shown.get(key)
    if (seen && (content === '' || seen.some((kept) => sameSection(kept, content)))) {
      return false
    }
    shown.set(key, [...(seen ?? []), content])
    return true
  })
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

/** Blank-row-separated stanzas as unlabelled sections. */
function stanzaSections(
  lines: SourceLine[],
  isBlank: (line: SourceLine) => boolean,
): Array<ApiLyricSection & { indices: number[] }> {
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
    if (isBlank(line)) flush()
    else current.push(line)
  }
  flush()
  return sections
}

/**
 * Split raw lyrics into API sections, in written order — a chorus written out
 * three times comes back three times; `uniqueSections` is what the API sends.
 * Header lines ('[Verse 1]', 'Chorus:') open a labelled section; text before
 * the first header — or the whole text when there are no headers — falls back
 * to unlabelled stanza sections, so the result is non-empty whenever the lyrics
 * contain any content.
 *
 * `layers` attaches the native / meaning / chord texts (#139). They are
 * line-parallel to `raw`, so each section carries the layer entries for exactly
 * the rows it kept, and the arrays stay the same length and index against each
 * other. A row is dropped only when the lyric and every layer are blank on it:
 * a row with chords and no words — an intro written as bars, a turnaround — is
 * kept, its `lines` entry an empty string beside its chords.
 */
export function toApiSections(
  raw: string | null | undefined,
  layers?: LyricLayerColumns | null,
): ApiLyricSection[] {
  if (!raw || !raw.trim()) return []
  const text = raw.replace(/\r\n/g, '\n')
  const lines = splitSourceLines(text)
  const layerRows = [layers?.lyrics_native, layers?.lyrics_meaning, layers?.lyrics_chords]
    .filter((layer): layer is string => !!layer && layer.trim() !== '')
    .map((layer) => layer.replace(/\r\n/g, '\n').split('\n'))
  const isBlank = (line: SourceLine) =>
    line.text.trim() === '' &&
    layerRows.every((rows) => (rows[line.index] ?? '').trim() === '')

  const sections: Array<ApiLyricSection & { indices: number[] }> = []
  let preamble: SourceLine[] = []
  let current: (ApiLyricSection & { indices: number[] }) | null = null

  for (const line of lines) {
    const header = matchHeader(line.text)
    if (header) {
      if (!current && preamble.length) {
        sections.push(...stanzaSections(preamble, isBlank))
        preamble = []
      }
      current = { type: header.type, label: header.label, lines: [], indices: [] }
      sections.push(current)
      continue
    }
    if (current) {
      if (!isBlank(line)) {
        current.lines.push(line.text.trim())
        current.indices.push(line.index)
      }
    } else {
      preamble.push(line)
    }
  }

  const result = !current
    ? stanzaSections(lines, isBlank)
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
