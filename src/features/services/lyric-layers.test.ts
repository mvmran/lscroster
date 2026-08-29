import { describe, expect, it } from 'vitest'
import {
  duplicateSectionLayers,
  EMPTY_LAYERS,
  findNonLatinLyrics,
  hasAnyLayer,
  layerLineMismatch,
  lineCount,
  insertSectionHeaders,
  lyricParagraphs,
  moveSectionLayers,
  padLayers,
  removeSectionLayers,
  splitChordLine,
  toLines,
  zipLyricLines,
  type LayeredLyrics,
} from '@/features/services/lyric-layers'
import { parseLyricSections } from '@/features/services/lyric-sections'

const SONG =
  '[Verse 1]\nAmazing grace\nhow sweet the sound\n\n[Chorus]\nPraise God\n\n[Verse 2]\nThrough many dangers'

/** The same song with every line annotated, so drift shows up immediately. */
const LAYERED: LayeredLyrics = {
  lyrics: SONG,
  native: '\nഅത്ഭുത കൃപ\nഎത്ര മധുരം\n\n\nദൈവത്തെ സ്തുതിക്കുക\n\n\nപല അപകടങ്ങളിലൂടെ',
  meaning: '\ngrace that astonishes\nhow sweet it sounds\n\n\npraise God\n\n\nthrough many perils',
  chords: '\nG        C\nG    D\n\n\nC    G\n\n\nEm   C',
}

const only = (lyrics: string): LayeredLyrics => ({ ...EMPTY_LAYERS, lyrics })

/** Every layer must keep the same number of lines as the base after a splice. */
function expectAligned(layers: LayeredLyrics) {
  const base = lineCount(layers.lyrics)
  expect(lineCount(layers.native)).toBe(base)
  expect(lineCount(layers.meaning)).toBe(base)
  expect(lineCount(layers.chords)).toBe(base)
}

describe('toLines / lineCount', () => {
  it('round trips exactly, trailing newline included', () => {
    expect(toLines('')).toEqual([])
    expect(toLines('a\nb')).toEqual(['a', 'b'])
    expect(toLines('a\nb\n')).toEqual(['a', 'b', ''])
    expect(toLines('a\r\nb').join('\n')).toBe('a\nb')
    expect(lineCount('a\nb\n')).toBe(3)
  })
})

describe('padLayers', () => {
  it('pads a short layer to the base line count', () => {
    const padded = padLayers({ ...EMPTY_LAYERS, lyrics: 'a\nb\nc', meaning: 'x' })
    expect(padded.meaning).toBe('x\n\n')
    expect(lineCount(padded.meaning)).toBe(3)
  })

  it('leaves an unused layer empty rather than filling it with blanks', () => {
    expect(padLayers({ ...EMPTY_LAYERS, lyrics: 'a\nb\nc' }).meaning).toBe('')
  })

  it('never truncates a layer longer than the base', () => {
    const padded = padLayers({ ...EMPTY_LAYERS, lyrics: 'a', meaning: 'x\ny\nz' })
    expect(padded.meaning).toBe('x\ny\nz')
  })

  it('pads with the base CRLF convention', () => {
    const padded = padLayers({ ...EMPTY_LAYERS, lyrics: 'a\r\nb', meaning: 'x' })
    expect(padded.meaning).toBe('x\r\n')
  })
})

describe('layerLineMismatch', () => {
  it('reports only non-empty layers that drifted', () => {
    const drifted = { ...EMPTY_LAYERS, lyrics: 'a\nb\nc', meaning: 'x\ny', native: '' }
    expect(layerLineMismatch(drifted)).toEqual([
      { key: 'meaning', lines: 2, baseLines: 3 },
    ])
    expect(layerLineMismatch(LAYERED)).toEqual([])
  })
})

describe('hasAnyLayer', () => {
  it('ignores whitespace-only layers', () => {
    expect(hasAnyLayer(only(SONG))).toBe(false)
    expect(hasAnyLayer({ ...only(SONG), meaning: '\n\n' })).toBe(false)
    expect(hasAnyLayer(LAYERED)).toBe(true)
  })
})

describe('moveSectionLayers', () => {
  it('reorders sections and preserves all content', () => {
    const moved = moveSectionLayers(only(SONG), parseLyricSections(SONG), 2, 1)
    expect(parseLyricSections(moved.lyrics).map((s) => s.label)).toEqual([
      'Verse 1',
      'Verse 2',
      'Chorus',
    ])
    expect(moved.lyrics).toContain('Through many dangers')
    expect(moved.lyrics).toContain('Praise God')
  })

  it('adds a separator when the old final section moves mid-text', () => {
    const moved = moveSectionLayers(only(SONG), parseLyricSections(SONG), 2, 0)
    expect(
      moved.lyrics.startsWith('[Verse 2]\nThrough many dangers\n\n[Verse 1]'),
    ).toBe(true)
  })

  it('is a byte-exact round trip when moved back', () => {
    const there = moveSectionLayers(only(SONG), parseLyricSections(SONG), 0, 1)
    const back = moveSectionLayers(there, parseLyricSections(there.lyrics), 1, 0)
    expect(back.lyrics).toBe(SONG)
  })

  it('preserves a blank preamble before the first header', () => {
    const text = '\n\n[Verse 1]\nA\n\n[Chorus]\nB'
    const moved = moveSectionLayers(only(text), parseLyricSections(text), 0, 1)
    expect(moved.lyrics).toBe('\n\n[Chorus]\nB\n\n[Verse 1]\nA\n')
  })

  it('returns the layers unchanged for a no-op or bad index', () => {
    const sections = parseLyricSections(SONG)
    expect(moveSectionLayers(LAYERED, sections, 1, 1)).toBe(LAYERED)
    expect(moveSectionLayers(LAYERED, sections, 5, 0)).toBe(LAYERED)
  })

  it('carries every layer along with the section', () => {
    const moved = moveSectionLayers(LAYERED, parseLyricSections(SONG), 2, 0)
    expectAligned(moved)
    const lines = zipLyricLines(moved)
    expect(lines[0].text).toBe('[Verse 2]')
    expect(lines[1]).toMatchObject({
      text: 'Through many dangers',
      native: 'പല അപകടങ്ങളിലൂടെ',
      meaning: 'through many perils',
      chords: 'Em   C',
    })
  })

  it('keeps the separator blank line in step across layers', () => {
    // Verse 2 has no trailing blank line, so moving it mid-text appends one —
    // to every layer, or everything below would shift by a line.
    const moved = moveSectionLayers(LAYERED, parseLyricSections(SONG), 2, 0)
    expect(toLines(moved.native)[2]).toBe('')
    expect(toLines(moved.meaning)[2]).toBe('')
    expect(toLines(moved.chords)[2]).toBe('')
  })
})

describe('duplicateSectionLayers', () => {
  it('inserts a copy right after the section', () => {
    const dup = duplicateSectionLayers(only(SONG), parseLyricSections(SONG), 1)
    expect(parseLyricSections(dup.lyrics).map((s) => s.label)).toEqual([
      'Verse 1',
      'Chorus',
      'Chorus',
      'Verse 2',
    ])
    expect(dup.lyrics.match(/Praise God/g)).toHaveLength(2)
  })

  it('separates the copy with a blank line when duplicating the tail', () => {
    const dup = duplicateSectionLayers(only(SONG), parseLyricSections(SONG), 2)
    expect(
      dup.lyrics.endsWith(
        'Through many dangers\n\n[Verse 2]\nThrough many dangers',
      ),
    ).toBe(true)
  })

  it('uses CRLF separators in CRLF text', () => {
    const text = '[Verse 1]\r\nA\r\n\r\n[Chorus]\r\nB'
    const dup = duplicateSectionLayers(only(text), parseLyricSections(text), 1)
    expect(dup.lyrics).toBe('[Verse 1]\r\nA\r\n\r\n[Chorus]\r\nB\r\n\r\n[Chorus]\r\nB')
  })

  it('duplicates every layer with the section', () => {
    const dup = duplicateSectionLayers(LAYERED, parseLyricSections(SONG), 1)
    expectAligned(dup)
    expect(dup.meaning.match(/praise God/g)).toHaveLength(2)
    expect(dup.native.match(/ദൈവത്തെ സ്തുതിക്കുക/g)).toHaveLength(2)
    expect(dup.chords.match(/C {4}G/g)).toHaveLength(2)
  })
})

describe('removeSectionLayers', () => {
  it('removes the header line and its lyrics exactly', () => {
    const removed = removeSectionLayers(only(SONG), parseLyricSections(SONG), 1)
    expect(removed.lyrics).toBe(
      '[Verse 1]\nAmazing grace\nhow sweet the sound\n\n[Verse 2]\nThrough many dangers',
    )
  })

  it('can remove an Unlabeled leading section', () => {
    const text = 'Oh oh oh\n\n[Verse 1]\nAmazing grace'
    const removed = removeSectionLayers(only(text), parseLyricSections(text), 0)
    expect(removed.lyrics).toBe('[Verse 1]\nAmazing grace')
  })

  it('removes the same lines from every layer', () => {
    const removed = removeSectionLayers(LAYERED, parseLyricSections(SONG), 1)
    expectAligned(removed)
    expect(removed.meaning).not.toContain('praise God')
    expect(removed.native).not.toContain('ദൈവത്തെ സ്തുതിക്കുക')
    expect(zipLyricLines(removed)[4]).toMatchObject({
      text: '[Verse 2]',
      meaning: '',
    })
  })
})

describe('zipLyricLines', () => {
  it('is driven by the base and blanks out missing layer lines', () => {
    const lines = zipLyricLines({ ...EMPTY_LAYERS, lyrics: 'a\nb', meaning: 'x' })
    expect(lines).toEqual([
      { text: 'a', native: '', meaning: 'x', chords: '', header: false },
      { text: 'b', native: '', meaning: '', chords: '', header: false },
    ])
  })

  it('ignores a longer layer trailing lines', () => {
    const lines = zipLyricLines({ ...EMPTY_LAYERS, lyrics: 'a', meaning: 'x\ny' })
    expect(lines).toHaveLength(1)
  })
})

describe('splitChordLine', () => {
  it('picks out a bare chord row, brackets stripped', () => {
    expect(splitChordLine('[G] [C]')).toEqual([
      { chord: true, text: 'G' },
      { chord: false, text: ' ' },
      { chord: true, text: 'C' },
    ])
  })

  it('keeps the syllables around an inline ChordPro chord', () => {
    expect(splitChordLine('[G]Amazing [C]grace')).toEqual([
      { chord: true, text: 'G' },
      { chord: false, text: 'Amazing ' },
      { chord: true, text: 'C' },
      { chord: false, text: 'grace' },
    ])
  })

  it('leaves a half-typed or empty bracket as plain text', () => {
    expect(splitChordLine('[G')).toEqual([{ chord: false, text: '[G' }])
    expect(splitChordLine('[]')).toEqual([{ chord: false, text: '[]' }])
  })

  it('handles a line with no chords, and an empty one', () => {
    expect(splitChordLine('just words')).toEqual([
      { chord: false, text: 'just words' },
    ])
    expect(splitChordLine('')).toEqual([])
  })

  it('round trips the line when the brackets are put back', () => {
    const line = '  [Am7]Through [F#m]many [G/B]dangers  '
    const back = splitChordLine(line)
      .map((s) => (s.chord ? `[${s.text}]` : s.text))
      .join('')
    expect(back).toBe(line)
  })
})

describe('findNonLatinLyrics', () => {
  it('passes plain Latin lyrics, punctuation, digits and accents', () => {
    expect(findNonLatinLyrics(SONG)).toBeNull()
    expect(findNonLatinLyrics("[Verse 1]\nCafé — 2 x 'Hallelujah!'")).toBeNull()
    expect(findNonLatinLyrics('')).toBeNull()
  })

  it('reports the first straying line and the characters on it', () => {
    const found = findNonLatinLyrics('Amazing grace\nഅത്ഭുത കൃപ\nഎത്ര')
    expect(found?.line).toBe(2)
    expect(found?.sample).not.toBe('')
    expect(found?.sample.length).toBeLessThanOrEqual(6)
  })

  it('catches other scripts too, not just Indic ones', () => {
    expect(findNonLatinLyrics('Слава')?.line).toBe(1)
    expect(findNonLatinLyrics('恵み')?.line).toBe(1)
  })
})

describe('zipLyricLines section headers', () => {
  it('shows a header once, not once per layer', () => {
    // The layers repeat the header so they stay line-parallel in the editor;
    // a sheet that printed all four would say "Verse 1" three times over.
    const lines = zipLyricLines({
      lyrics: '[Verse 1]\nAmazing grace',
      native: '[Verse 1]\nഅത്ഭുത കൃപ',
      meaning: '[Verse 1]\nAmazing grace',
      chords: '',
    })
    expect(lines[0]).toEqual({
      text: '[Verse 1]',
      native: '',
      meaning: '',
      chords: '',
      header: true,
    })
    expect(lines[1].native).toBe('അത്ഭുത കൃപ')
  })
})

describe('lyricParagraphs', () => {
  it('splits on blank lines and remembers where each one starts', () => {
    expect(lyricParagraphs('one\ntwo\n\n\nthree')).toEqual([
      { start: 0, lines: ['one', 'two'] },
      { start: 4, lines: ['three'] },
    ])
  })

  it('has nothing to say about empty or blank text', () => {
    expect(lyricParagraphs('')).toEqual([])
    expect(lyricParagraphs('\n\n')).toEqual([])
  })
})

describe('insertSectionHeaders', () => {
  const layers: LayeredLyrics = {
    lyrics: 'Amazing grace\n\nPraise God',
    native: 'അത്ഭുത കൃപ\n\nദൈവത്തെ',
    meaning: '',
    chords: '',
  }

  it('adds the header to the base and to every layer beside it', () => {
    const next = insertSectionHeaders(layers, [
      { before: 0, label: 'Verse 1' },
      { before: 2, label: 'Chorus' },
    ])
    expect(toLines(next.lyrics)).toEqual([
      'Verse 1',
      'Amazing grace',
      '',
      'Chorus',
      'Praise God',
    ])
    // A header added to the base alone would push the native text one row down
    // for the rest of the song.
    expect(lineCount(next.native)).toBe(lineCount(next.lyrics))
    expect(toLines(next.native)[3]).toBe('Chorus')
    expect(next.meaning).toBe('')
  })

  it('skips the paragraphs the labeller had no name for', () => {
    const next = insertSectionHeaders(layers, [
      { before: 0, label: '' },
      { before: 2, label: 'Chorus' },
    ])
    expect(toLines(next.lyrics)).toEqual([
      'Amazing grace',
      '',
      'Chorus',
      'Praise God',
    ])
  })

  it('is a no-op when nothing was labelled', () => {
    expect(insertSectionHeaders(layers, [{ before: 0, label: '  ' }])).toBe(layers)
  })

  it('lands the headers where the editor will parse them as sections', () => {
    const next = insertSectionHeaders(layers, [
      { before: 0, label: 'Verse 1' },
      { before: 2, label: 'Chorus' },
    ])
    expect(parseLyricSections(next.lyrics).map((s) => s.label)).toEqual([
      'Verse 1',
      'Chorus',
    ])
  })
})
