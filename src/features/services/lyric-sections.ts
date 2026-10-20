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
  /** Normalised display label, e.g. "Verse 1" or "Unlabelled". */
  label: string
  /** Compact 1–3 char label for tight UI, e.g. "V1", "PC", "C". */
  short: string
  /** Lower-case section keyword ("verse", "chorus", …) or "unlabeled" (a key). */
  kind: string
  /** Offset of the section's first character (its header line, if any). */
  start: number
  /** Offset just past the header line's newline (= start when unlabelled). */
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
 * first header becomes an "Unlabelled" section so no content can be lost by
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
      label: 'Unlabelled',
      short: '•',
      kind: 'unlabeled',
      start: 0,
      bodyStart: 0,
      end: sections[0].start,
    })
  }
  return sections
}

// --- sections that share a heading ---------------------------------------------

/**
 * A section's words as a singer reads them — chords, case and punctuation
 * dropped, blank lines gone — so two copies of a chorus compare equal however
 * they were typed. Empty for a section with nothing to sing.
 */
export function lyricWords(text: string): string {
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

/**
 * The chords a section plays, line by line — "[6m]Ther[4]e" reads "6m 4" —
 * so where a chord sits over the syllable doesn't make a different section,
 * but a different chord does.
 */
export function lyricChords(text: string): string {
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
 * What makes a section the same as another: its words *and* its chords. Two
 * verses with the same words over different chords are two verses. `body` is
 * the section's lyrics (chords written into them, as in a paste, count too)
 * and `chordLayer` the chord lines beside them, if the song keeps them apart.
 * Empty for a section with neither — a heading on its own, meaning sing it
 * again.
 */
export function sectionContent(body: string, chordLayer = ''): string {
  const words = lyricWords(body)
  const chords = lyricChords(`${body}\n${chordLayer}`)
  return words === '' && chords === '' ? '' : `${words}\u0001${chords}`
}

/** A content's words and chords, apart. */
function contentParts(content: string): { words: string; chords: string } {
  const at = content.indexOf('\u0001')
  return { words: content.slice(0, at), chords: content.slice(at + 1) }
}

/**
 * Whether two sections (`sectionContent`) are the same one sung again: the
 * same words over the same chords — or over no chords on one of them. A chart
 * writes a chorus's chords out once and plays them every time it comes round,
 * so a repeat with its chords left off is still a repeat. Only chords written
 * on both and different make two sections.
 */
export function sameSection(a: string, b: string): boolean {
  if (a === b) return true
  if (a === '' || b === '') return false
  const one = contentParts(a)
  const two = contentParts(b)
  return one.words === two.words && (one.chords === '' || two.chords === '')
}

/**
 * Each section's content as the section it repeats, for grouping and counting
 * with `sameSection`'s rule. One with no chords written takes the content of
 * the first section of the same `key` with its words and chords, so a chorus
 * charted once and repeated bare counts as one chorus; anything else stands as
 * itself. Mapping to the *chorded* one keeps two differently-chorded verses
 * apart even when a bare third shares their words.
 */
export function canonicalContents(
  sections: Array<{ key: string; content: string }>,
): string[] {
  const chorded = new Map<string, string>()
  const wordsKey = (key: string, words: string) => `${key}\u0002${words}`
  for (const { key, content } of sections) {
    if (content === '') continue
    const { words, chords } = contentParts(content)
    if (chords !== '' && !chorded.has(wordsKey(key, words))) {
      chorded.set(wordsKey(key, words), content)
    }
  }
  return sections.map(({ key, content }) => {
    if (content === '') return content
    const { words, chords } = contentParts(content)
    return chords === '' ? (chorded.get(wordsKey(key, words)) ?? content) : content
  })
}

/**
 * Which section a heading line names, for telling repeats apart: its kind and
 * designator, with no designator read as 1 — "Verse" and "Verse 1" are the
 * same verse — and any repeat count ignored. Null for a line that isn't one.
 */
export function sectionKeyOf(line: string): string | null {
  const header = matchLyricSectionHeader(line)
  return header && `${header.kind}:${(header.designator ?? '1').toUpperCase()}`
}

/**
 * The song's sequence — the order it is sung in, as section labels ("Intro",
 * "Verse", "Verse 2", "Chorus ×2" …) — read from its headings. What the strip
 * above the lyrics editor shows, and what a save records (0057).
 */
export function lyricSequence(text: string): string[] {
  return parseLyricSections(text)
    .filter((section) => section.kind !== 'unlabeled')
    .map((section) => section.label)
}

/**
 * A lyrics version's sequence: as saved with it (0057), or read from its
 * headings for one saved before. Empty with no lyrics.
 */
export function songSequenceOf(
  row: { lyrics: string; sequence: string[] | null } | null,
): string[] {
  return row ? (row.sequence ?? lyricSequence(row.lyrics)) : []
}

/**
 * The section names a plan's sequence for the song can be built from: each
 * heading in its lyrics once, in the order they first come, then any the
 * song's saved sequence names that the headings no longer do.
 */
export function sequenceChoices(lyrics: string, sequence: string[] = []): string[] {
  return [...new Set([...lyricSequence(lyrics), ...sequence])]
}

/** Whether two sequences name the same sections in the same order. */
export function sameSequence(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((label, i) => label === b[i])
}

export interface SequenceStep {
  label: string
  /** The pill's short form, with any repeat count: "V2", "C×2". */
  short: string
  kind: string
}

/** A stored sequence as steps to show; a label it can't read stands as is. */
export function sequenceSteps(sequence: string[]): SequenceStep[] {
  return sequence.map((label) => {
    const header = matchLyricSectionHeader(label)
    if (header === null) return { label, short: label, kind: 'unlabeled' }
    const times = header.repeat ? `×${header.repeat}` : ''
    return { label, short: `${header.short}${times}`, kind: header.kind }
  })
}

/** The texts sections are read from: the lyrics and, if kept apart, their chords. */
export interface SectionSource {
  lyrics: string
  chords?: string
}

interface HeadedSection {
  /** The heading line exactly as typed. */
  line: string
  kind: string
  /** Which one of its kind: "Verse" and "Verse 1" are the same section. */
  key: string
  /** The number in the heading, 1 when it has none, 0 for a letter. */
  number: number
  /** Its words and chords (`sectionContent`); empty for a bare heading. */
  content: string
}

/** The labelled sections of the lyrics, with their headings and content. */
function headedSections({ lyrics, chords = '' }: SectionSource): HeadedSection[] {
  const chordLines = chords.split(/\r?\n/)
  const rowOf = (offset: number) => lyrics.slice(0, offset).split('\n').length - 1
  return parseLyricSections(lyrics)
    .filter((section) => section.kind !== 'unlabeled')
    .map((section) => {
      const line = lyrics.slice(section.start, section.bodyStart).replace(/\r?\n$/, '')
      const designator = matchLyricSectionHeader(line)?.designator ?? null
      // The chord layer is line-parallel: the rows under this heading.
      const layer =
        chords === ''
          ? ''
          : chordLines
              .slice(
                rowOf(section.start) + 1,
                section.end >= lyrics.length ? undefined : rowOf(section.end),
              )
              .join('\n')
      return {
        line,
        kind: section.kind,
        key: sectionKeyOf(line) ?? section.kind,
        number: designator === null ? 1 : Number.parseInt(designator, 10) || 0,
        content: sectionContent(lyrics.slice(section.bodyStart, section.end), layer),
      }
    })
}

/**
 * The labelled sections with each content as the section it repeats
 * (`canonicalContents`), so a chorus whose chords are written once counts as
 * one chorus however often it comes round bare.
 */
function groupedSections(source: SectionSource): HeadedSection[] {
  const sections = headedSections(source)
  const contents = canonicalContents(sections)
  return sections.map((section, i) => ({ ...section, content: contents[i] }))
}

/**
 * Headings that more than one section shares while their words or chords
 * differ — two "Verse"s that are different verses — which the order of
 * service, the sheet and the projection can't tell apart. A heading with
 * nothing under it is a cue ("Chorus" meaning sing it again), so it never
 * counts as different, and nor do chords left off a repeat (`sameSection`).
 */
export function sharedHeadingConflicts(source: SectionSource): string[] {
  const groups = new Map<string, { line: string; contents: Set<string> }>()
  for (const section of groupedSections(source)) {
    if (section.content === '') continue
    const group = groups.get(section.key) ?? {
      line: section.line.trim(),
      contents: new Set<string>(),
    }
    group.contents.add(section.content)
    groups.set(section.key, group)
  }
  return [...groups.values()].filter((g) => g.contents.size > 1).map((g) => g.line)
}

/**
 * Rewrite a heading line with a new number, keeping how it was typed —
 * "VERSE" → "VERSE 2", "[Verse 1]" → "[Verse 3]", "Chorus x2:" → "Chorus 2 x2:".
 * Falls back to the keyword and number alone if the line won't take one in
 * place.
 */
export function renumberHeadingLine(line: string, number: number): string {
  const header = matchLyricSectionHeader(line)
  if (header === null) return line
  const inPlace = line.replace(
    new RegExp(`^(\\s*[\\[(]?\\s*(?:${KEYWORD_PATTERN}))(?:\\s*\\d{1,2}|\\s+[A-Da-d])?`, 'i'),
    `$1 ${number}`,
  )
  const check = matchLyricSectionHeader(inPlace)
  if (
    check !== null &&
    check.kind === header.kind &&
    check.designator === String(number) &&
    check.repeat === header.repeat
  ) {
    return inPlace
  }
  const keyword = new RegExp(`(${KEYWORD_PATTERN})`, 'i').exec(line)?.[1] ?? header.kind
  return `${keyword} ${number}${header.repeat ? ` x${header.repeat}` : ''}`
}

/** A heading the editor renumbered: section `index`'s line went `from` → `to`. */
export interface HeadingRename {
  index: number
  from: string
  to: string
}

/**
 * Number the sections that share a heading but not their words or chords
 * (`sharedHeadingConflicts`), so each is told apart: the first one sung gets
 * the heading's own number ("VERSE" → "VERSE 1"), each different one the next
 * free number of its kind ("VERSE 2"), and a word-for-word, chord-for-chord
 * repeat the same number as the section it repeats. Bare headings are left
 * alone — which one they repeat is anyone's guess. Apply with
 * `renameSectionHeading`.
 */
export function numberSharedHeadings(source: SectionSource): HeadingRename[] {
  const sections = groupedSections(source)
  const highest = new Map<string, number>()
  const contents = new Map<string, string[]>()
  for (const section of sections) {
    highest.set(section.kind, Math.max(highest.get(section.kind) ?? 0, section.number))
    if (section.content === '') continue
    const seen = contents.get(section.key) ?? []
    if (!seen.includes(section.content)) seen.push(section.content)
    contents.set(section.key, seen)
  }
  const numbers = new Map<string, number>()
  const renames: HeadingRename[] = []
  sections.forEach((section, index) => {
    const seen = contents.get(section.key)
    if (seen === undefined || seen.length < 2 || section.content === '') return
    const id = `${section.key}\u0002${section.content}`
    let number = numbers.get(id)
    if (number === undefined) {
      if (seen[0] === section.content) {
        number = section.number
      } else {
        number = (highest.get(section.kind) ?? 0) + 1
        highest.set(section.kind, number)
      }
      numbers.set(id, number)
    }
    // A lettered heading ("Verse A") is already told apart by its letter.
    if (number === 0) return
    const to = renumberHeadingLine(section.line, number)
    if (to !== section.line) renames.push({ index, from: section.line, to })
  })
  return renames
}

/**
 * Follow one edit to the lyrics or their chords. When it changes a section
 * that was a word-for-word, chord-for-chord repeat — the third "VERSE" of a
 * song that sings one verse three times — that section is now a verse of its
 * own, so its heading takes the next free number ("VERSE 2"). If a later edit
 * makes it a repeat again (typing back what was deleted), the heading goes
 * back to what it was.
 *
 * `renamed` is the renumbering still in effect from earlier edits; the result
 * carries it forward. Edits that add, remove or retitle a heading start it
 * afresh: section indexes no longer line up, and a heading someone typed is
 * theirs to name. `index` counts labelled sections only.
 */
export function followSectionEdit(
  prev: SectionSource,
  next: SectionSource,
  renamed: HeadingRename[],
): { rename: HeadingRename | null; renamed: HeadingRename[] } {
  const before = headedSections(prev)
  const after = headedSections(next)
  if (
    before.length !== after.length ||
    before.some((section, i) => section.line !== after[i].line)
  ) {
    return { rename: null, renamed: [] }
  }
  const edited = after.flatMap((section, i) =>
    section.content !== before[i].content ? [i] : [],
  )
  if (edited.length !== 1) return { rename: null, renamed }
  const index = edited[0]
  const section = after[index]
  if (section.content === '') return { rename: null, renamed }
  // Adding chords to one copy of a chorus whose others are bare leaves it a
  // repeat: `sameSection` reads chords left off as the same chords.
  const repeats = (sections: HeadedSection[], key: string, content: string) =>
    sections.some(
      (other, i) => i !== index && other.key === key && sameSection(other.content, content),
    )

  const earlier = renamed.find((r) => r.index === index)
  if (earlier) {
    const originalKey = sectionKeyOf(earlier.from)
    if (originalKey !== null && repeats(after, originalKey, section.content)) {
      const rename = { index, from: earlier.to, to: earlier.from }
      return { rename, renamed: renamed.filter((r) => r !== earlier) }
    }
    return { rename: null, renamed }
  }

  const wasRepeat =
    before[index].content !== '' && repeats(before, section.key, before[index].content)
  if (!wasRepeat || repeats(after, section.key, section.content)) {
    return { rename: null, renamed }
  }
  const number =
    Math.max(...after.filter((s) => s.kind === section.kind).map((s) => s.number)) + 1
  const rename = { index, from: section.line, to: renumberHeadingLine(section.line, number) }
  return { rename, renamed: [...renamed, rename] }
}
