import { describe, expect, it } from 'vitest'
import {
  followSectionEdit,
  lyricWords,
  matchLyricSectionHeader,
  parseLyricSections,
  renumberHeadingLine,
  sharedHeadingConflicts,
  type HeadingRename,
} from '@/features/services/lyric-sections'

describe('matchLyricSectionHeader', () => {
  it('matches bracketed, bare, parenthesised and colon styles', () => {
    expect(matchLyricSectionHeader('[Verse 1]')).toEqual({ label: 'Verse 1', short: 'V1', kind: 'verse', designator: '1', repeat: null })
    expect(matchLyricSectionHeader('Chorus:')).toEqual({ label: 'Chorus', short: 'C', kind: 'chorus', designator: null, repeat: null })
    expect(matchLyricSectionHeader('(Bridge)')).toEqual({ label: 'Bridge', short: 'B', kind: 'bridge', designator: null, repeat: null })
    expect(matchLyricSectionHeader('  Intro  ')).toEqual({ label: 'Intro', short: 'I', kind: 'intro', designator: null, repeat: null })
  })

  it('is case-insensitive and normalises the label', () => {
    expect(matchLyricSectionHeader('VERSE 2')).toEqual({ label: 'Verse 2', short: 'V2', kind: 'verse', designator: '2', repeat: null })
    expect(matchLyricSectionHeader('pre chorus')).toEqual({ label: 'Pre-Chorus', short: 'PC', kind: 'pre-chorus', designator: null, repeat: null })
    expect(matchLyricSectionHeader('PRE-CHORUS 2:')).toEqual({ label: 'Pre-Chorus 2', short: 'PC2', kind: 'pre-chorus', designator: '2', repeat: null })
  })

  it('supports numeric and lettered designators', () => {
    expect(matchLyricSectionHeader('Verse1')).toEqual({ label: 'Verse 1', short: 'V1', kind: 'verse', designator: '1', repeat: null })
    expect(matchLyricSectionHeader('Verse a')).toEqual({ label: 'Verse A', short: 'VA', kind: 'verse', designator: 'A', repeat: null })
  })

  it('rejects lyric lines that merely contain a keyword', () => {
    expect(matchLyricSectionHeader('He walked a bridge of sorrow')).toBeNull()
    expect(matchLyricSectionHeader('Chorusa')).toBeNull()
    expect(matchLyricSectionHeader('The intro was long')).toBeNull()
    expect(matchLyricSectionHeader('')).toBeNull()
  })

  it('tolerates a trailing carriage return (CRLF text)', () => {
    expect(matchLyricSectionHeader('[Chorus]\r')).toEqual({ label: 'Chorus', short: 'C', kind: 'chorus', designator: null, repeat: null })
  })
})

const SONG = '[Verse 1]\nAmazing grace\nhow sweet the sound\n\n[Chorus]\nPraise God\n\n[Verse 2]\nThrough many dangers'

describe('parseLyricSections', () => {
  it('returns [] for empty text or text without headers', () => {
    expect(parseLyricSections('')).toEqual([])
    expect(parseLyricSections('just some lyrics\nwith no headers')).toEqual([])
  })

  it('splits on header lines with correct offsets', () => {
    const sections = parseLyricSections(SONG)
    expect(sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2'])
    // offsets partition the text: each section's slice starts with its header
    for (const s of sections) {
      expect(SONG.slice(s.start, s.end).startsWith(SONG.slice(s.start, s.bodyStart - 1))).toBe(true)
    }
    expect(sections[0].start).toBe(0)
    expect(sections[1].start).toBe(SONG.indexOf('[Chorus]'))
    expect(sections[2].end).toBe(SONG.length)
  })

  it('collects non-blank text before the first header as Unlabelled', () => {
    const text = 'Oh oh oh\n\n[Verse 1]\nAmazing grace'
    const sections = parseLyricSections(text)
    expect(sections.map((s) => s.label)).toEqual(['Unlabelled', 'Verse 1'])
    expect(sections[0].start).toBe(0)
    expect(sections[0].bodyStart).toBe(0)
    expect(sections[0].end).toBe(text.indexOf('[Verse 1]'))
  })

  it('ignores blank leading whitespace (no Unlabelled section)', () => {
    const sections = parseLyricSections('\n\n[Verse 1]\nAmazing grace')
    expect(sections.map((s) => s.label)).toEqual(['Verse 1'])
    expect(sections[0].start).toBe(2)
  })

  it('keeps repeated labels as separate sections', () => {
    const sections = parseLyricSections('[Chorus]\nA\n\n[Chorus]\nA')
    expect(sections.map((s) => s.label)).toEqual(['Chorus', 'Chorus'])
  })

  it('handles CRLF line endings', () => {
    const text = '[Verse 1]\r\nAmazing grace\r\n\r\n[Chorus]\r\nPraise God'
    const sections = parseLyricSections(text)
    expect(sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus'])
    expect(text.slice(sections[1].start, sections[1].end)).toBe('[Chorus]\r\nPraise God')
  })

  it('handles a header as the very last line', () => {
    const sections = parseLyricSections('[Verse 1]\nAmazing grace\n[Outro]')
    expect(sections.map((s) => s.label)).toEqual(['Verse 1', 'Outro'])
    expect(sections[1].bodyStart).toBe(sections[1].end)
  })
})

describe('repeat counts in a heading', () => {
  it('reads the count and keeps it in the label, not the pill', () => {
    const h = matchLyricSectionHeader('Bridge 1 X3')
    expect(h).toMatchObject({ kind: 'bridge', label: 'Bridge 1 ×3', short: 'B1' })
    expect(h?.designator).toBe('1')
    expect(h?.repeat).toBe(3)
  })

  it('takes the count either way round, and in brackets', () => {
    expect(matchLyricSectionHeader('Chorus x2')?.label).toBe('Chorus ×2')
    expect(matchLyricSectionHeader('Chorus 2x')?.label).toBe('Chorus ×2')
    expect(matchLyricSectionHeader('Chorus (x2)')?.label).toBe('Chorus ×2')
    expect(matchLyricSectionHeader('Bridge 3 ×2')?.label).toBe('Bridge 3 ×2')
  })

  it('still reads a plain designator as a designator, not a count', () => {
    const h = matchLyricSectionHeader('Verse 2')
    expect(h?.label).toBe('Verse 2')
    expect(h?.designator).toBe('2')
    expect(h?.repeat).toBeNull()
  })

  it('tolerates the trailing whitespace charts leave behind', () => {
    expect(matchLyricSectionHeader('Bridge 1 X3      ')?.label).toBe('Bridge 1 ×3')
  })

  it('is still not fooled by a lyric line', () => {
    expect(matchLyricSectionHeader('Praise the Lord')).toBeNull()
    expect(matchLyricSectionHeader('REPEAT CHORUS')).toBeNull()
  })
})

// The shape of "No One Like The Lord": one verse sung three times, a chorus.
const VERSE = 'There is One on the throne\nHe is worthy of praise'
const CHORUS = 'Worthy is the Lamb\nNo one like the Lord'
const REPEATS = [
  'INTRO',
  '',
  'VERSE',
  VERSE,
  '',
  'VERSE',
  VERSE,
  '',
  'CHORUS',
  CHORUS,
  '',
  'VERSE',
  VERSE,
  '',
  'CHORUS2',
  CHORUS,
].join('\n')

describe('lyricWords', () => {
  it('reads past chords, case, punctuation and blank lines', () => {
    expect(lyricWords('[G]Worthy is the [C]Lamb,\n\nNO ONE like the Lord!\n')).toBe(
      'worthy is the lamb\nno one like the lord',
    )
    expect(lyricWords('\n\n')).toBe('')
  })
})

describe('sharedHeadingConflicts', () => {
  it('is empty while every repeat of a heading has the same words', () => {
    expect(sharedHeadingConflicts(REPEATS)).toEqual([])
  })

  it('names a heading whose sections have different words', () => {
    const edited = REPEATS.replace('VERSE\n' + VERSE + '\n\nCHORUS', 'VERSE\nA new verse\n\nCHORUS')
    expect(sharedHeadingConflicts(edited)).toEqual(['VERSE'])
  })

  it('reads "Verse" and "Verse 1" as the same section, "Verse 2" as another', () => {
    expect(sharedHeadingConflicts('Verse\nOne\n\nVerse 1\nTwo')).toEqual(['Verse'])
    expect(sharedHeadingConflicts('Verse 1\nOne\n\nVerse 2\nTwo')).toEqual([])
  })

  it('lets a heading with nothing under it stand as a cue', () => {
    expect(sharedHeadingConflicts(`Chorus\n${CHORUS}\n\nVerse 2\nWords\n\nChorus\n`)).toEqual([])
  })
})

describe('renumberHeadingLine', () => {
  it('keeps the heading as it was typed', () => {
    expect(renumberHeadingLine('VERSE', 2)).toBe('VERSE 2')
    expect(renumberHeadingLine('[Verse 1]', 3)).toBe('[Verse 3]')
    expect(renumberHeadingLine('Chorus:', 2)).toBe('Chorus 2:')
    expect(renumberHeadingLine('CHORUS2', 3)).toBe('CHORUS 3')
    expect(renumberHeadingLine('Chorus x2', 2)).toBe('Chorus 2 x2')
    expect(renumberHeadingLine('Pre-Chorus', 2)).toBe('Pre-Chorus 2')
  })

  it('reads a count as a count, not a number', () => {
    // "Verse 2x" is the verse sung twice, not verse 2.
    const line = renumberHeadingLine('Verse 2x', 3)
    expect(matchLyricSectionHeader(line)).toMatchObject({ designator: '3', repeat: 2 })
  })
})

describe('followSectionEdit', () => {
  // Typing one letter into the second VERSE (labelled section 2).
  const typed = (text: string) => {
    const at = text.indexOf(VERSE, text.indexOf('VERSE', text.indexOf('VERSE') + 1))
    return `${text.slice(0, at)}X${text.slice(at)}`
  }

  it('numbers a repeat whose words change', () => {
    const { rename, renamed } = followSectionEdit(REPEATS, typed(REPEATS), [])
    expect(rename).toEqual({ index: 2, from: 'VERSE', to: 'VERSE 2' })
    expect(renamed).toEqual([rename])
  })

  it('takes the next number free for the kind', () => {
    // CHORUS2 is already taken, so the edited CHORUS becomes CHORUS 3.
    const song = `CHORUS\n${CHORUS}\n\nCHORUS\n${CHORUS}\n\nCHORUS2\nAnother`
    const edited = song.replace(`CHORUS\n${CHORUS}`, `CHORUS\nX${CHORUS}`)
    expect(followSectionEdit(song, edited, []).rename).toEqual({
      index: 0,
      from: 'CHORUS',
      to: 'CHORUS 3',
    })
  })

  it('leaves punctuation and case edits alone', () => {
    const touched = REPEATS.replace('VERSE\n' + VERSE + '\n\nCHORUS', 'VERSE\n' + VERSE + '!\n\nCHORUS')
    expect(followSectionEdit(REPEATS, touched, []).rename).toBeNull()
  })

  it('leaves a section that was not a repeat alone', () => {
    const song = 'Verse 1\nOne\n\nVerse 2\nTwo'
    expect(followSectionEdit(song, 'Verse 1\nOne\n\nVerse 2\nTwo more', []).rename).toBeNull()
  })

  it('puts the heading back when the words become a repeat again', () => {
    const first = followSectionEdit(REPEATS, typed(REPEATS), [])
    // As the editor holds it after the rename: the heading reads VERSE 2.
    const lines = typed(REPEATS).split('\n')
    expect(lines[6]).toBe('VERSE')
    lines[6] = 'VERSE 2'
    const after = lines.join('\n')
    lines[7] = lines[7].replace('X', '')
    const back = followSectionEdit(after, lines.join('\n'), first.renamed)
    expect(back.rename).toEqual({ index: 2, from: 'VERSE 2', to: 'VERSE' })
    expect(back.renamed).toEqual([])
  })

  it('starts afresh when a heading is added, removed or retitled', () => {
    const prior: HeadingRename[] = [{ index: 2, from: 'VERSE', to: 'VERSE 2' }]
    const retitled = REPEATS.replace('INTRO', 'Intro')
    expect(followSectionEdit(REPEATS, retitled, prior)).toEqual({ rename: null, renamed: [] })
  })
})
