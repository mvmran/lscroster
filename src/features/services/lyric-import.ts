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
 * The editor's layers are line-parallel, which the source format is not: a
 * section's three texts routinely differ in length. Sections are therefore
 * aligned at their first line and padded to their tallest text, so a short
 * gloss never drags the next verse out of step with its own native lines.
 */

import {
  alignLayer,
  findNonLatinLyrics,
  hasAnyLayer,
  toLines,
  type LayeredLyrics,
} from '@/features/services/lyric-layers'
import { matchLyricSectionHeader } from '@/features/services/lyric-sections'
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

export interface ParsedImport {
  /** The layers to append. `chords` is always empty — the format has none. */
  layers: LayeredLyrics
  /** Header lines found ("Verse 1", "Chorus"), for the dialog's summary. */
  sections: number
  hasNative: boolean
  hasMeaning: boolean
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

/** Parse pasted text into the layers it would add. */
export function parseImportedLyrics(text: string): ParsedImport {
  const blocks: Block[] = splitAtHeaders(toLines(text)).map(({ header, body }) =>
    routeNativeOnly({ header, ...splitAtKeywords(body) }),
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

  // The base keeps its blank rows whenever a layer has text. A script we can't
  // romanise leaves the base empty, and collapsing it to '' would cost the
  // layers their alignment — and drop the import outright, since
  // `appendImportedLyrics` measures everything against the base's line count.
  const anyText = [lyrics, native, meaning].some((lines) =>
    lines.some((line) => line.trim() !== ''),
  )

  return {
    layers: {
      lyrics: anyText ? lyrics.join('\n') : '',
      native: used(native),
      meaning: used(meaning),
      chords: '',
    },
    sections: blocks.filter((block) => block.header !== null).length,
    hasNative: native.some((line) => line.trim() !== ''),
    hasMeaning: meaning.some((line) => line.trim() !== ''),
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
 */
export function withGeneratedMeaning(
  layers: LayeredLyrics,
  drafted: string,
): LayeredLyrics {
  if (drafted.trim() === '') return layers
  return alignLayer({ ...layers, meaning: drafted }, 'meaning')
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
