/**
 * Import pasted multi-lingual lyrics into the four layers.
 *
 * The teams keep their songs in a plain-text format that stacks the three
 * texts of a section under its header:
 *
 * ```
 * Verse 1
 * <native script>
 * Transliteration
 * <singable Latin text>
 * Meaning
 * <English gloss>
 * ```
 *
 * `Transliteration` and `Meaning` (or `Translation`) are the only keywords —
 * everything before the first of them is native script when the section
 * transliterates, and plain lyrics when it does not, so an English song with
 * neither keyword imports as lyrics alone.
 *
 * A section with no keyword whose text is *not* Latin is native script all the
 * same: it moves to the native layer, and `withGeneratedTransliteration` drafts
 * the base text from it (see `transliterate.ts`). A script we cannot romanise
 * leaves the base blank for the team to type.
 *
 * A paste may also be a chord chart — chords written above the words, the way
 * every chord site publishes them. Those rows are recognised and converted to
 * ChordPro on the way in (`chord-chart.ts`); the words are unaffected, so a
 * chart imports as ordinary lyrics with a chord layer beside them.
 *
 * The editor's layers are line-parallel, which the source format is not: a
 * section's three texts routinely differ in length. Sections are therefore
 * aligned at their first line and padded to their tallest text, so a short
 * gloss never drags the next verse out of step with its own native lines.
 */

import { mergeChordRows, splitInlineChords } from '@/features/services/chord-chart'
import {
  stripDirectives,
  type ImportedMetadata,
} from '@/features/services/chordpro-directives'
import {
  alignLayer,
  findNonLatinLyrics,
  hasAnyLayer,
  mirrorSectionHeaders,
  toLines,
  type LayeredLyrics,
} from '@/features/services/lyric-layers'
import {
  matchLyricSectionHeader,
  REPEAT_MARKER_RE,
} from '@/features/services/lyric-sections'
import {
  detectIndicScript,
  transliterate,
  type IndicScript,
} from '@/features/services/transliterate'

// "Translation" heads the English gloss, not the singable Latin text: a
// translation carries the sense across, a transliteration only the sound. It is
// therefore a synonym for "Meaning" — and, since the two words share a prefix,
// the transliteration pattern is anchored to the full word so it can't swallow
// one for the other.
const TRANSLITERATION_RE = /^\s*transliterations?\s*:?\s*$/i
const MEANING_RE = /^\s*(?:meanings?|translations?)\s*:?\s*$/i

/**
 * Number a paste's paragraphs as "Verse 1", "Verse 2" … so an unstructured
 * song arrives with the section pills the editor is built around.
 *
 * A paragraph is a run of non-blank lines; blank lines separate them, which is
 * how every team writes a song out in the first place. Three rules keep it from
 * guessing wrong:
 *
 * - A paste that already names a section anywhere — even one "Chorus" among
 *   six unlabelled verses — is left exactly as it is. Half-labelled text is a
 *   deliberate act, and renumbering around it would fight the person who did it.
 * - A paragraph that opens with `Transliteration` or `Meaning` continues the
 *   section above it rather than starting a new one, so a paste that puts a
 *   blank line between a verse's three texts keeps them in one section — a
 *   header wedged in there would strand the transliteration in a section of its
 *   own, with its native lines left behind in the previous one.
 * - A lone first line reads as the song's title, not as a one-line verse, so it
 *   keeps its place above "Verse 1" instead of becoming it — unless a keyword
 *   block follows it, which makes it a verse's native text after all.
 *
 * Nothing is added to a paste with only one paragraph to label: a single
 * "Verse 1" over the whole song is structure in name alone.
 *
 * `from` is where the count starts. An import lands at the end of lyrics that
 * may already have verses of their own, and a song with two "Verse 1"s is worse
 * than one with none — `nextVerseNumber` reads the editor and carries on from
 * there.
 */
/** The verse number an import should start at, given the lyrics it joins. */
export function nextVerseNumber(lyrics: string): number {
  const numbers = toLines(lyrics).map((line) => {
    const header = matchLyricSectionHeader(line)
    if (header === null || header.kind !== 'verse') return 0
    // The designator, not the label: a label may carry a repeat count too
    // ("Verse 2 ×3"), and stripping non-digits from that reads it as verse 23.
    // "Verse" with no designator is the song's first verse by any reading.
    return Number.parseInt(header.designator ?? '', 10) || 1
  })
  return Math.max(0, ...numbers) + 1
}

export function withVerseHeadings(text: string, from = 1): string {
  const lines = toLines(text)
  if (lines.some((line) => matchLyricSectionHeader(line) !== null)) return text

  const paragraphs = lines.reduce<number[]>((acc, line, i) => {
    if (line.trim() !== '' && (lines[i - 1] ?? '').trim() === '') acc.push(i)
    return acc
  }, [])
  const opensKeyword = (start: number) =>
    TRANSLITERATION_RE.test(lines[start]) || MEANING_RE.test(lines[start])
  const starts = paragraphs.filter((start) => !opensKeyword(start))

  // A lone opening line is the title — unless a Transliteration or Meaning
  // block follows it, which makes it the first line of a verse's native text
  // rather than a name for the song.
  const titled =
    starts.length > 1 &&
    starts[0] === paragraphs[0] &&
    (lines[paragraphs[0] + 1] ?? '').trim() === '' &&
    paragraphs[1] !== undefined &&
    !opensKeyword(paragraphs[1])
  const labelled = titled ? starts.slice(1) : starts
  if (labelled.length < 2) return text

  // Joined with LF: the result is only ever handed straight back to
  // `parseImportedLyrics`, which splits on either ending and joins with LF.
  const numbered = new Map(labelled.map((start, i) => [start, `Verse ${from + i}`]))
  return lines
    .flatMap((line, i) => {
      const header = numbered.get(i)
      return header === undefined ? [line] : [header, line]
    })
    .join('\n')
}

export interface ParsedImport {
  /**
   * The layers to append. `chords` is filled when the paste was a chord chart
   * — chords written above the words — and empty otherwise. They arrive in
   * whatever notation the chart used; the caller numbers them against the
   * arrangement's key before they are stored.
   */
  layers: LayeredLyrics
  /** Header lines found ("Verse 1", "Chorus"), for the dialog's summary. */
  sections: number
  hasNative: boolean
  hasMeaning: boolean
  /** True when chord rows were recognised above the lyrics. */
  hasChords: boolean
  /** What a ChordPro file said about itself, for the dialog to offer. */
  metadata: ImportedMetadata
  /**
   * True when a section arrived as native script with no transliteration, so
   * its base text is blank and waiting to be generated (or typed).
   */
  needsTransliteration: boolean
  /** The Indic script that native text is in, or null if we can't romanise it. */
  script: IndicScript | null
}

/** Drop blank lines from both ends, keeping any inside the block. */
function trimBlankEnds(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

const padTo = (lines: string[], height: number): string[] =>
  lines.length >= height
    ? lines
    : [...lines, ...Array<string>(height - lines.length).fill('')]

/** One source section: its header line, if any, and its three texts. */
interface Block {
  header: string | null
  native: string[]
  main: string[]
  meaning: string[]
}

/** Cut the paste at its header lines; text before the first one leads. */
function splitAtHeaders(
  lines: string[],
): Array<{ header: string | null; body: string[] }> {
  const blocks: Array<{ header: string | null; body: string[] }> = []
  let current: { header: string | null; body: string[] } = { header: null, body: [] }
  const keep = (block: { header: string | null; body: string[] }) =>
    block.header !== null || block.body.some((line) => line.trim() !== '')

  for (const line of lines) {
    if (matchLyricSectionHeader(line)) {
      if (keep(current)) blocks.push(current)
      current = { header: line.trim(), body: [] }
    } else {
      current.body.push(line)
    }
  }
  if (keep(current)) blocks.push(current)
  return blocks
}

/** Split one section's body at its transliteration / `Meaning` keywords. */
function splitAtKeywords(body: string[]): Omit<Block, 'header'> {
  const lead: string[] = []
  const main: string[] = []
  const meaning: string[] = []
  let target: string[] | null = null
  let transliterated = false

  for (const line of body) {
    if (TRANSLITERATION_RE.test(line)) {
      transliterated = true
      target = main
    } else if (MEANING_RE.test(line)) {
      target = meaning
    } else {
      ;(target ?? lead).push(line)
    }
  }

  // Without a transliteration keyword the leading text *is* the lyrics — that
  // is every English song, and the reason one is never forced to translate.
  if (transliterated) {
    return {
      native: trimBlankEnds(lead),
      main: trimBlankEnds(main),
      meaning: trimBlankEnds(meaning),
    }
  }
  return {
    native: [],
    main: trimBlankEnds([...lead, ...main]),
    meaning: trimBlankEnds(meaning),
  }
}

/**
 * A section with no transliteration keyword whose text is not Latin is native
 * script, not lyrics.
 *
 * Without this it landed in the base layer, which must stay Latin, and the save
 * was blocked with no way forward. Moving it to the native layer leaves the base
 * holding only the header — ready for `withGeneratedTransliteration` to fill, or
 * for the team to type when the script is one we can't romanise.
 */
function routeNativeOnly(block: Block): Block {
  if (block.native.length > 0) return block
  if (findNonLatinLyrics(block.main.join('\n')) === null) return block
  return { ...block, native: block.main, main: [] }
}

/**
 * Replace every "REPEAT CHORUS" line with the section it names.
 *
 * Charts save a page by naming a section instead of printing it again, which
 * is fine on paper and useless here: the line is not a header, so it lands
 * among the words and gets sung, and the running order loses the section
 * altogether — the one thing a projectionist following the plan needs.
 *
 * The copy is taken from the nearest matching section *above* the marker,
 * header line and all, and is a copy in the plainest sense: a one-time
 * transformation of the paste, reviewed in the editor before it is saved.
 * Nothing references anything afterwards, so nothing can go stale.
 *
 * Every layer is spliced together, and the source lines are taken from the
 * same rows of each, so the four texts stay parallel and the chords come along
 * with the words they sit on. A marker naming a section that isn't there
 * becomes a bare header, which is at least structure rather than a lyric.
 */
function expandRepeatMarkers(layers: Record<'lyrics' | 'native' | 'meaning', string[]>) {
  const source = layers.lyrics
  const LAYERS = ['lyrics', 'native', 'meaning'] as const
  const headerAt = (i: number) => matchLyricSectionHeader(source[i] ?? '')

  /**
   * Where a section's words run: from its header to the next one, with the
   * blank lines at either edge left out. `limit` stops the scan short, which
   * is what keeps a section from swallowing the marker that named it.
   *
   * `from === end` means the section has nothing under it at all. A section
   * whose only body is a row of chords is *not* empty by this test, because
   * the chords are still inline in the base at this point — which is exactly
   * why an intro of `[C]` stands wordless and is left alone.
   */
  function bodyOf(start: number, limit = source.length) {
    let end = start + 1
    while (end < limit && headerAt(end) === null) end += 1
    let from = start + 1
    while (from < end && (source[from] ?? '').trim() === '') from += 1
    while (end > from && (source[end - 1] ?? '').trim() === '') end -= 1
    return { from, end }
  }

  for (let i = 0; i < source.length; i += 1) {
    const marker = REPEAT_MARKER_RE.exec(source[i])
    const header = marker ? null : headerAt(i)

    let kind: string
    let wanted: string | null
    if (marker) {
      kind = marker[1].toLowerCase().replace(/^pre[\s-]?chorus$/, 'pre-chorus')
      wanted = marker[2] ?? null
    } else if (header) {
      // A section named with nothing under it is the same shorthand written a
      // different way: charts print "Chorus" on its own where the words have
      // already been given in full above.
      if (bodyOf(i).from < bodyOf(i).end) continue
      kind = header.kind
      wanted = header.designator
    } else {
      continue
    }

    // The nearest section above that matches — by kind, and by number when one
    // was given ("REPEAT VERSE 2") — and that has words of its own to copy.
    let start = -1
    for (let j = i - 1; j >= 0; j -= 1) {
      const above = headerAt(j)
      if (!above || above.kind !== kind) continue
      if (wanted !== null && above.designator !== wanted) continue
      const body = bodyOf(j, i)
      if (body.from >= body.end) continue
      start = j
      break
    }

    if (start === -1) {
      // An empty section with nothing above it to fill it is simply an empty
      // section; only a marker line needs turning into one.
      if (!marker) continue
      // Leave a header so it is structure, not something to sing.
      const label = kind.charAt(0).toUpperCase() + kind.slice(1)
      for (const key of LAYERS) layers[key][i] = key === 'lyrics' ? label : ''
      continue
    }

    if (marker) {
      // The marker line becomes the whole section, header and all.
      const { end } = bodyOf(start, i)
      const count = end - start
      for (const key of LAYERS) layers[key].splice(i, 1, ...layers[key].slice(start, end))
      // Skip past what was just inserted; its own header must not re-match.
      i += count - 1
    } else {
      // The header is already there — and is the one to keep, since it may
      // carry a repeat count the original did not ("Chorus ×3"). Only the
      // words are copied, in underneath it.
      const { from, end } = bodyOf(start, i)
      for (const key of LAYERS) layers[key].splice(i + 1, 0, ...layers[key].slice(from, end))
      i += end - from
    }
  }
}

/**
 * Everything a paste needs before its layers can be read: its ChordPro
 * directives resolved, then its chord rows folded into the lines they sit over.
 *
 * Both are line-level rewrites and both must happen before anything counts
 * paragraphs or splits sections, so the dialog runs them once and hands the
 * result to `parseImportedLyrics` and `withVerseHeadings` alike. Both are
 * idempotent, so the parser can run them again for a caller that hasn't.
 */
export function prepareImport(text: string): {
  text: string
  metadata: ImportedMetadata
} {
  const stripped = stripDirectives(text)
  return { text: mergeChordRows(stripped.text), metadata: stripped.metadata }
}

/** Parse pasted text into the layers it would add. */
export function parseImportedLyrics(text: string): ParsedImport {
  const prepared = prepareImport(text)
  const blocks: Block[] = splitAtHeaders(toLines(prepared.text)).map(
    ({ header, body }) => routeNativeOnly({ header, ...splitAtKeywords(body) }),
  )

  const lyrics: string[] = []
  const native: string[] = []
  const meaning: string[] = []

  blocks.forEach((block, index) => {
    if (index > 0) {
      // A blank row between sections, in every layer, so they stay parallel.
      lyrics.push('')
      native.push('')
      meaning.push('')
    }
    // The header opens every layer that has text, not the lyrics alone: the
    // four texts are edited side by side, and a layer whose verses are labelled
    // like the lyrics beside them is the one a person can actually read. Read
    // views print it once (`zipLyricLines`).
    const head = block.header === null ? [] : [block.header]
    const sectionLyrics = [...head, ...block.main]
    const sectionNative = block.native.length === 0 ? [] : [...head, ...block.native]
    const sectionMeaning = block.meaning.length === 0 ? [] : [...head, ...block.meaning]
    const height = Math.max(
      sectionLyrics.length,
      sectionNative.length,
      sectionMeaning.length,
    )
    lyrics.push(...padTo(sectionLyrics, height))
    native.push(...padTo(sectionNative, height))
    meaning.push(...padTo(sectionMeaning, height))
  })

  const used = (lines: string[]) =>
    lines.some((line) => line.trim() !== '') ? lines.join('\n') : ''

  // The base keeps its blank rows whenever a layer has text. A script we can't
  // romanise leaves the base empty, and collapsing it to '' would cost the
  // layers their alignment — and drop the import outright, since
  // `appendImportedLyrics` measures everything against the base's line count.
  const anyText = [lyrics, native, meaning].some((lines) =>
    lines.some((line) => line.trim() !== ''),
  )

  // Before the chords are lifted out, so a repeated section is copied with the
  // chords still inline on its lines and needs no separate splice.
  expandRepeatMarkers({ lyrics, native, meaning })

  // The chords have ridden through the pipeline inside the base text, which
  // is what kept them aligned to their own lines; this puts them back in the
  // layer they belong to and leaves the base holding the words alone.
  const base = splitInlineChords(anyText ? lyrics.join('\n') : '')

  // The chord layer is cut from the base *after* the headers were put there,
  // so it alone comes back blank on a header row — the native and meaning
  // layers picked theirs up as their sections were assembled. Copying them in
  // is what makes the four panes read alike in the editor: a header row that
  // is labelled in one column and empty in the next looks like a mistake.
  // Read views and the printed sheet still show one header, because
  // `zipLyricLines` drops every layer's entry on a header row.
  const layers = mirrorSectionHeaders(
    {
      lyrics: base.lyrics,
      native: used(native),
      meaning: used(meaning),
      chords: base.chords,
    },
    'chords',
  )

  return {
    layers,
    // Counted from the finished base: an expanded repeat adds a section that
    // the source blocks never had.
    sections: toLines(base.lyrics).filter(
      (line) => matchLyricSectionHeader(line) !== null,
    ).length,
    hasNative: native.some((line) => line.trim() !== ''),
    hasMeaning: meaning.some((line) => line.trim() !== ''),
    hasChords: base.chords !== '',
    metadata: prepared.metadata,
    needsTransliteration: blocks.some(
      (block) => block.native.length > 0 && block.main.length === 0,
    ),
    script: detectIndicScript(native.join('\n')),
  }
}

/**
 * Fill the blank base lines of a native-only import with a generated draft.
 *
 * Only blank base lines that have native text beside them are written, so a
 * paste that mixes transliterated sections with native-only ones keeps every
 * transliteration the team already wrote. The layers stay line-parallel because
 * `transliterate` preserves the native text's line count exactly.
 */
export async function withGeneratedTransliteration(
  layers: LayeredLyrics,
  script: IndicScript,
): Promise<LayeredLyrics> {
  const romanised = toLines(await transliterate(layers.native, script))
  const native = toLines(layers.native)
  const lyrics = toLines(layers.lyrics).map((line, i) =>
    line.trim() === '' && (native[i] ?? '').trim() !== '' ? (romanised[i] ?? '') : line,
  )
  return { ...layers, lyrics: lyrics.join('\n') }
}

/**
 * Fill the meaning layer of an import with the draft `generate-meaning` made
 * from its native text.
 *
 * The function answers one entry per line it was sent, so a draft taken from
 * `layers.native` — which the parser already padded against the base — arrives
 * line-parallel. `alignLayer` is a belt-and-braces pad to the base's height for
 * the case where it does not, and a draft that came back blank is dropped
 * rather than written as a column of nothing.
 *
 * The model is asked to leave a section header blank — a header is structure,
 * not a line to translate — so the headers are copied across afterwards and the
 * pane reads like the ones beside it.
 */
export function withGeneratedMeaning(
  layers: LayeredLyrics,
  drafted: string,
): LayeredLyrics {
  if (drafted.trim() === '') return layers
  return mirrorSectionHeaders(
    alignLayer({ ...layers, meaning: drafted }, 'meaning'),
    'meaning',
  )
}

/**
 * Append parsed layers to what the editor already holds, blank row between.
 *
 * Every layer is padded to the base's height on both sides of the join, so
 * importing native text into a song that had none lands it against the right
 * lines rather than at the top, and chords already typed keep their rows.
 */
export function appendImportedLyrics(
  current: LayeredLyrics,
  imported: LayeredLyrics,
): LayeredLyrics {
  if (imported.lyrics === '' && !hasAnyLayer(imported)) return current
  if (current.lyrics.trim() === '' && !hasAnyLayer(current)) return imported

  const currentBase = toLines(current.lyrics)
  const importedBase = toLines(imported.lyrics)

  const layer = (key: 'native' | 'meaning' | 'chords') => {
    const before = padTo(toLines(current[key]), currentBase.length)
    const after = padTo(toLines(imported[key]), importedBase.length)
    const lines = [...before, '', ...after]
    return lines.some((line) => line.trim() !== '') ? lines.join('\n') : ''
  }

  return {
    lyrics: [...currentBase, '', ...importedBase].join('\n'),
    native: layer('native'),
    meaning: layer('meaning'),
    chords: layer('chords'),
  }
}
