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
 * `Transliteration` and `Meaning` are the only keywords — everything before the
 * first of them is native script when the section transliterates, and plain
 * lyrics when it does not, so an English song with neither keyword imports as
 * lyrics alone.
 *
 * The editor's layers are line-parallel, which the source format is not: a
 * section's three texts routinely differ in length. Sections are therefore
 * aligned at their first line and padded to their tallest text, so a short
 * gloss never drags the next verse out of step with its own native lines.
 */

import { hasAnyLayer, toLines, type LayeredLyrics } from '@/features/services/lyric-layers'
import { matchLyricSectionHeader } from '@/features/services/lyric-sections'

const TRANSLITERATION_RE = /^\s*transliterations?\s*:?\s*$/i
const MEANING_RE = /^\s*meanings?\s*:?\s*$/i

export interface ParsedImport {
  /** The layers to append. `chords` is always empty — the format has none. */
  layers: LayeredLyrics
  /** Header lines found ("Verse 1", "Chorus"), for the dialog's summary. */
  sections: number
  hasNative: boolean
  hasMeaning: boolean
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

/** Split one section's body at its `Transliteration` / `Meaning` keywords. */
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

  // Without a Transliteration keyword the leading text *is* the lyrics — that
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

/** Parse pasted text into the layers it would add. */
export function parseImportedLyrics(text: string): ParsedImport {
  const blocks: Block[] = splitAtHeaders(toLines(text)).map(({ header, body }) => ({
    header,
    ...splitAtKeywords(body),
  }))

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
    // The header belongs to the lyrics alone; the layers get a blank beside it.
    const head = block.header === null ? [] : [block.header]
    const blank = block.header === null ? [] : ['']
    const sectionLyrics = [...head, ...block.main]
    const sectionNative = block.native.length === 0 ? [] : [...blank, ...block.native]
    const sectionMeaning = block.meaning.length === 0 ? [] : [...blank, ...block.meaning]
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

  return {
    layers: {
      lyrics: used(lyrics),
      native: used(native),
      meaning: used(meaning),
      chords: '',
    },
    sections: blocks.filter((block) => block.header !== null).length,
    hasNative: native.some((line) => line.trim() !== ''),
    hasMeaning: meaning.some((line) => line.trim() !== ''),
  }
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
  if (imported.lyrics === '') return current
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
