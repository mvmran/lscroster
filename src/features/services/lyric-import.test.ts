import { describe, expect, it } from 'vitest'
import {
  appendImportedLyrics,
  nextVerseNumber,
  parseImportedLyrics,
  withGeneratedMeaning,
  withGeneratedTransliteration,
  withVerseHeadings,
} from '@/features/services/lyric-import'
import { EMPTY_LAYERS, lineCount, toLines } from '@/features/services/lyric-layers'

/** The format the team pastes: title, then a header + three texts per section. */
const MULTILINGUAL = [
  'Aa karathaaril mukhamonnamarthi',
  '',
  'Verse 1',
  'ആ കരതാരിൽ മുഖമൊന്നമർത്തി',
  'ഒന്ന് കരയാൻ കഴിഞ്ഞിരുന്നെങ്കിൽ',
  'Transliteration',
  'aa karathaaril mukhamonnumarthi',
  'onnu karayaan kazhinjirunnenkil',
  'Meaning',
  'If I had pressed my face once against those hands',
  'If only I had been able to weep once',
  '',
  'Verse 2',
  'കാൽവറി നാഥാ കരുണാമയാ',
  'Transliteration',
  'kaalvari natha karunamaya',
  'Meaning',
  'O Lord of Calvary, O Merciful One',
  '',
].join('\n')

describe('parseImportedLyrics', () => {
  it('routes each keyword block to its own layer', () => {
    const { layers, sections, hasNative, hasMeaning } =
      parseImportedLyrics(MULTILINGUAL)
    expect(sections).toBe(2)
    expect(hasNative).toBe(true)
    expect(hasMeaning).toBe(true)
    expect(toLines(layers.lyrics)[0]).toBe('Aa karathaaril mukhamonnamarthi')
    expect(toLines(layers.lyrics)).toContain('aa karathaaril mukhamonnumarthi')
    expect(toLines(layers.native)).toContain('ആ കരതാരിൽ മുഖമൊന്നമർത്തി')
    expect(layers.chords).toBe('')
  })

  it('keeps every layer the same height, so lines stay parallel', () => {
    const { layers } = parseImportedLyrics(MULTILINGUAL)
    expect(lineCount(layers.native)).toBe(lineCount(layers.lyrics))
    expect(lineCount(layers.meaning)).toBe(lineCount(layers.lyrics))
  })

  it('leaves the layers blank beside a header line', () => {
    const { layers } = parseImportedLyrics(MULTILINGUAL)
    const at = toLines(layers.lyrics).indexOf('Verse 1')
    expect(at).toBeGreaterThan(-1)
    expect(toLines(layers.native)[at]).toBe('')
    expect(toLines(layers.meaning)[at]).toBe('')
  })

  it('starts the next section after the longest text of the last one', () => {
    // Verse 1: 2 native, 2 lyrics, 3 meaning lines — the gloss is the tallest.
    const uneven = [
      'Verse 1',
      'നാ',
      'Transliteration',
      'naa',
      'Meaning',
      'one',
      'two',
      'three',
      '',
      'Verse 2',
      'Transliteration',
      'second verse',
    ].join('\n')
    const { layers } = parseImportedLyrics(uneven)
    const lyrics = toLines(layers.lyrics)
    const meaning = toLines(layers.meaning)
    expect(meaning[lyrics.indexOf('Verse 2')]).toBe('')
    expect(meaning.filter((l) => l !== '')).toEqual(['one', 'two', 'three'])
    expect(lineCount(layers.meaning)).toBe(lineCount(layers.lyrics))
  })

  it('accepts Translation as a spelling of the meaning keyword', () => {
    // A translation carries the sense across, a transliteration only the sound:
    // "Translation" heads the English gloss, never the singable Latin text.
    const { layers, hasNative, hasMeaning } = parseImportedLyrics(
      ['Verse 1', 'നാ', 'Transliteration', 'naa', 'Translation', 'one'].join('\n'),
    )
    expect(hasNative).toBe(true)
    expect(hasMeaning).toBe(true)
    expect(toLines(layers.lyrics)).toContain('naa')
    expect(toLines(layers.native)).toContain('നാ')
    expect(toLines(layers.meaning)).toContain('one')
  })

  it('keeps Transliteration and Translation apart despite the shared prefix', () => {
    const { layers } = parseImportedLyrics(
      ['Verse 1', 'Transliteration', 'sound', 'Translation', 'sense'].join('\n'),
    )
    expect(toLines(layers.lyrics)).toContain('sound')
    expect(toLines(layers.lyrics)).not.toContain('sense')
    expect(toLines(layers.meaning)).toContain('sense')
    expect(toLines(layers.meaning)).not.toContain('sound')
  })

  it('drafts the base for native text glossed under Translation', async () => {
    // No Transliteration heading at all: the native text still routes to its
    // own layer, Translation fills the meaning, and the base is generated.
    const parsed = parseImportedLyrics(
      ['Verse 1', 'ആ കരതാരിൽ', 'Translation', 'Into those hands'].join('\n'),
    )
    expect(parsed.hasNative).toBe(true)
    expect(parsed.hasMeaning).toBe(true)
    expect(parsed.needsTransliteration).toBe(true)
    const filled = await withGeneratedTransliteration(parsed.layers, parsed.script!)
    expect(toLines(filled.lyrics)).toContain('aa karathaaril')
    expect(toLines(filled.meaning)).toContain('Into those hands')
    expect(lineCount(filled.lyrics)).toBe(lineCount(filled.native))
  })

  it('routes a native-only section to the native layer, not the base', async () => {
    // No Transliteration keyword and non-Latin text: this used to land in the
    // base, which must stay Latin, so the save was blocked with no way out.
    const parsed = parseImportedLyrics('Verse 1\nആ കരതാരിൽ\nകാൽവറി')
    expect(parsed.hasNative).toBe(true)
    expect(parsed.needsTransliteration).toBe(true)
    expect(parsed.script).toMatchObject({ scheme: 'malayalam', language: 'ml' })
    expect(toLines(parsed.layers.lyrics).filter((l) => l !== '')).toEqual(['Verse 1'])
    expect(toLines(parsed.layers.native)).toContain('ആ കരതാരിൽ')

    const filled = await withGeneratedTransliteration(parsed.layers, parsed.script!)
    expect(toLines(filled.lyrics)).toContain('aa karathaaril')
    expect(lineCount(filled.lyrics)).toBe(lineCount(filled.native))
  })

  it('leaves the base blank for a script it cannot romanise', () => {
    const parsed = parseImportedLyrics('Verse 1\nСлава Богу')
    expect(parsed.hasNative).toBe(true)
    expect(parsed.needsTransliteration).toBe(true)
    // Nothing is guessed at — the team types this one.
    expect(parsed.script).toBeNull()
    expect(toLines(parsed.layers.lyrics).filter((l) => l !== '')).toEqual(['Verse 1'])
    expect(toLines(parsed.layers.native)).toContain('Слава Богу')
  })

  it('generates only where the base is blank, keeping written transliterations', async () => {
    const mixed = [
      'Verse 1',
      'ആ കരതാരിൽ',
      'Transliteration',
      'the human wrote this',
      '',
      'Verse 2',
      'കാൽവറി',
    ].join('\n')
    const parsed = parseImportedLyrics(mixed)
    expect(parsed.needsTransliteration).toBe(true)
    const filled = await withGeneratedTransliteration(parsed.layers, parsed.script!)
    const lyrics = toLines(filled.lyrics)
    expect(lyrics).toContain('the human wrote this')
    expect(lyrics).toContain('kaalvari')
    expect(lineCount(filled.lyrics)).toBe(lineCount(filled.native))
  })

  it('keeps a headerless native-only paste through the append', () => {
    // The base is blank here — an unromanisable script with no header line to
    // put in it. Collapsing it to '' used to drop the whole import silently,
    // because appendImportedLyrics measures the layers against the base.
    const parsed = parseImportedLyrics('Слава Богу\nвовеки')
    const appended = appendImportedLyrics(EMPTY_LAYERS, parsed.layers)
    expect(appended.native).toBe('Слава Богу\nвовеки')

    const onto = appendImportedLyrics(
      { ...EMPTY_LAYERS, lyrics: 'Amazing grace\nhow sweet' },
      parsed.layers,
    )
    expect(lineCount(onto.native)).toBe(lineCount(onto.lyrics))
  })

  it('reports no transliteration needed for an ordinary multi-lingual paste', () => {
    const parsed = parseImportedLyrics(MULTILINGUAL)
    expect(parsed.needsTransliteration).toBe(false)
  })

  it('imports a plain English song as lyrics only', () => {
    const { layers, hasNative, hasMeaning, sections } = parseImportedLyrics(
      'Verse 1\nAmazing grace how sweet the sound\n\nChorus\nHow great thou art',
    )
    expect(hasNative).toBe(false)
    expect(hasMeaning).toBe(false)
    expect(sections).toBe(2)
    expect(layers.native).toBe('')
    expect(layers.meaning).toBe('')
    expect(toLines(layers.lyrics)).toContain('Amazing grace how sweet the sound')
  })

  it('handles text with no headers at all, and empty input', () => {
    const { layers, sections } = parseImportedLyrics('just a line\nand another')
    expect(sections).toBe(0)
    expect(layers.lyrics).toBe('just a line\nand another')
    expect(parseImportedLyrics('').layers).toEqual(EMPTY_LAYERS)
    expect(parseImportedLyrics('   \n\n').layers.lyrics).toBe('')
  })
})

describe('appendImportedLyrics', () => {
  it('replaces an empty editor outright', () => {
    const { layers } = parseImportedLyrics(MULTILINGUAL)
    expect(appendImportedLyrics(EMPTY_LAYERS, layers)).toEqual(layers)
  })

  it('adds after existing lyrics without overwriting them', () => {
    const current = { ...EMPTY_LAYERS, lyrics: 'Verse 1\nexisting line' }
    const { layers } = parseImportedLyrics('Verse 2\nAmazing grace')
    const next = appendImportedLyrics(current, layers)
    expect(toLines(next.lyrics)).toEqual([
      'Verse 1',
      'existing line',
      '',
      'Verse 2',
      'Amazing grace',
    ])
  })

  it('keeps every layer parallel across the join', () => {
    const current = {
      lyrics: 'Verse 1\nexisting line',
      native: '',
      meaning: '',
      chords: '[G]\n[C]',
    }
    const { layers } = parseImportedLyrics(MULTILINGUAL)
    const next = appendImportedLyrics(current, layers)
    expect(lineCount(next.native)).toBe(lineCount(next.lyrics))
    expect(lineCount(next.meaning)).toBe(lineCount(next.lyrics))
    expect(lineCount(next.chords)).toBe(lineCount(next.lyrics))
    // The imported native text lands beside its own lines, not at the top.
    expect(toLines(next.native).slice(0, 3)).toEqual(['', '', ''])
  })

  it('leaves an unused layer empty rather than a column of blanks', () => {
    const current = { ...EMPTY_LAYERS, lyrics: 'existing' }
    const { layers } = parseImportedLyrics('Verse 1\nAmazing grace')
    expect(appendImportedLyrics(current, layers).native).toBe('')
  })

  it('is a no-op when there is nothing to import', () => {
    const current = { ...EMPTY_LAYERS, lyrics: 'existing' }
    expect(appendImportedLyrics(current, EMPTY_LAYERS)).toEqual(current)
  })
})

describe('withGeneratedMeaning', () => {
  // What the `generate-meaning` function answers: one entry per line of the
  // native text it was sent, blank against a header or a blank row.
  const draftFor = (native: string) =>
    toLines(native)
      .map((line) => (line.trim() === '' ? '' : `meaning of ${line}`))
      .join('\n')

  it('lands the draft line-parallel to a native-only import', async () => {
    const parsed = parseImportedLyrics('Verse 1\nആ കരതാരിൽ\nകാൽവറി')
    const filled = withGeneratedMeaning(
      await withGeneratedTransliteration(parsed.layers, parsed.script!),
      draftFor(parsed.layers.native),
    )
    expect(lineCount(filled.meaning)).toBe(lineCount(filled.lyrics))
    expect(toLines(filled.meaning)).toContain('meaning of ആ കരതാരിൽ')
    // The header row keeps its blank, so line N still belongs to line N.
    expect(toLines(filled.meaning)[toLines(filled.lyrics).indexOf('Verse 1')]).toBe('')
  })

  it('pads a short draft out to the base rather than leaving it adrift', () => {
    const layers = { ...EMPTY_LAYERS, lyrics: 'one\ntwo\nthree', native: 'a\nb\nc' }
    const filled = withGeneratedMeaning(layers, 'first')
    expect(toLines(filled.meaning)).toEqual(['first', '', ''])
  })

  it('drops a draft that came back empty', () => {
    const layers = { ...EMPTY_LAYERS, lyrics: 'one\ntwo', native: 'a\nb' }
    expect(withGeneratedMeaning(layers, '  \n ')).toEqual(layers)
  })
})

describe('withVerseHeadings', () => {
  const ENGLISH = [
    'Amazing Grace',
    '',
    'Amazing grace how sweet the sound',
    'That saved a wretch like me',
    '',
    'I once was lost but now am found',
    'Was blind but now I see',
    '',
  ].join('\n')

  it('numbers the paragraphs and leaves the title alone', () => {
    expect(toLines(withVerseHeadings(ENGLISH))).toEqual([
      'Amazing Grace',
      '',
      'Verse 1',
      'Amazing grace how sweet the sound',
      'That saved a wretch like me',
      '',
      'Verse 2',
      'I once was lost but now am found',
      'Was blind but now I see',
      '',
    ])
  })

  it('leaves a paste that already names a section — even one — untouched', () => {
    const partly = ENGLISH.replace('I once was lost', 'Chorus\nI once was lost')
    expect(withVerseHeadings(partly)).toBe(partly)
    expect(withVerseHeadings(MULTILINGUAL)).toBe(MULTILINGUAL)
  })

  it('keeps a keyword block with the verse above it', () => {
    // A blank line between a verse's three texts must not split the section:
    // the transliteration would land in a verse of its own, its native lines
    // stranded in the one before.
    const spaced = [
      'ആ കരതാരിൽ',
      '',
      'Transliteration',
      'aa karathaaril',
      '',
      'Meaning',
      'Into those hands',
      '',
      'കാൽവറി നാഥാ',
      '',
      'Transliteration',
      'kaalvari natha',
    ].join('\n')
    const headed = withVerseHeadings(spaced)
    expect(toLines(headed).filter((line) => line.startsWith('Verse'))).toEqual([
      'Verse 1',
      'Verse 2',
    ])
    expect(toLines(headed)[0]).toBe('Verse 1')

    const parsed = parseImportedLyrics(headed)
    expect(parsed.sections).toBe(2)
    expect(toLines(parsed.layers.lyrics)).toContain('aa karathaaril')
    expect(toLines(parsed.layers.native)).toContain('ആ കരതാരിൽ')
    expect(lineCount(parsed.layers.native)).toBe(lineCount(parsed.layers.lyrics))
    expect(lineCount(parsed.layers.meaning)).toBe(lineCount(parsed.layers.lyrics))
  })

  it('carries on from the verses the editor already holds', () => {
    // The import lands after them, so restarting at 1 would leave the song
    // with two "Verse 1"s.
    const current = 'Verse 1\nHoly, holy, holy\n\nChorus\nLord God almighty'
    expect(nextVerseNumber(current)).toBe(2)
    const headed = withVerseHeadings(ENGLISH, nextVerseNumber(current))
    expect(toLines(headed).filter((line) => line.startsWith('Verse'))).toEqual([
      'Verse 2',
      'Verse 3',
    ])
  })

  it('starts at 1 against lyrics with no verses of their own', () => {
    expect(nextVerseNumber('')).toBe(1)
    expect(nextVerseNumber('Chorus\nHow great thou art')).toBe(1)
    // An unnumbered "Verse" is the first one by any reading.
    expect(nextVerseNumber('Verse\nHow great thou art')).toBe(2)
    expect(nextVerseNumber('Verse 1\na\n\nVerse 7\nb')).toBe(8)
  })

  it('adds nothing when there is only one paragraph to label', () => {
    const one = 'Amazing grace how sweet the sound\nThat saved a wretch like me'
    expect(withVerseHeadings(one)).toBe(one)
    expect(withVerseHeadings(`Amazing Grace\n\n${one}`)).toBe(`Amazing Grace\n\n${one}`)
    expect(withVerseHeadings('')).toBe('')
  })

  it('feeds the parser sections it can build layers from', () => {
    const parsed = parseImportedLyrics(withVerseHeadings(ENGLISH))
    expect(parsed.sections).toBe(2)
    expect(parsed.hasNative).toBe(false)
    expect(toLines(parsed.layers.lyrics)).toContain('Verse 2')
  })
})
