import { describe, expect, it } from 'vitest'
import {
  followSectionEdit,
  lyricChords,
  lyricSequence,
  lyricWords,
  matchLyricSectionHeader,
  numberSharedHeadings,
  parseLyricSections,
  renumberHeadingLine,
  sameSection,
  sameSequence,
  sectionContent,
  sectionKeyOf,
  sequenceChoices,
  songSequenceOf,
  sequenceSteps,
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

// The helpers read the lyrics and, when kept apart, their chord layer.
const conflicts = (lyrics: string, chords?: string) => sharedHeadingConflicts({ lyrics, chords })
const follow = (prev: string, next: string, renamed: HeadingRename[]) =>
  followSectionEdit({ lyrics: prev }, { lyrics: next }, renamed)

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
    expect(conflicts(REPEATS)).toEqual([])
  })

  it('names a heading whose sections have different words', () => {
    const edited = REPEATS.replace('VERSE\n' + VERSE + '\n\nCHORUS', 'VERSE\nA new verse\n\nCHORUS')
    expect(conflicts(edited)).toEqual(['VERSE'])
  })

  it('reads "Verse" and "Verse 1" as the same section, "Verse 2" as another', () => {
    expect(conflicts('Verse\nOne\n\nVerse 1\nTwo')).toEqual(['Verse'])
    expect(conflicts('Verse 1\nOne\n\nVerse 2\nTwo')).toEqual([])
  })

  it('lets a heading with nothing under it stand as a cue', () => {
    expect(conflicts(`Chorus\n${CHORUS}\n\nVerse 2\nWords\n\nChorus\n`)).toEqual([])
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
    const { rename, renamed } = follow(REPEATS, typed(REPEATS), [])
    expect(rename).toEqual({ index: 2, from: 'VERSE', to: 'VERSE 2' })
    expect(renamed).toEqual([rename])
  })

  it('takes the next number free for the kind', () => {
    // CHORUS2 is already taken, so the edited CHORUS becomes CHORUS 3.
    const song = `CHORUS\n${CHORUS}\n\nCHORUS\n${CHORUS}\n\nCHORUS2\nAnother`
    const edited = song.replace(`CHORUS\n${CHORUS}`, `CHORUS\nX${CHORUS}`)
    expect(follow(song, edited, []).rename).toEqual({
      index: 0,
      from: 'CHORUS',
      to: 'CHORUS 3',
    })
  })

  it('leaves punctuation and case edits alone', () => {
    const touched = REPEATS.replace('VERSE\n' + VERSE + '\n\nCHORUS', 'VERSE\n' + VERSE + '!\n\nCHORUS')
    expect(follow(REPEATS, touched, []).rename).toBeNull()
  })

  it('leaves a section that was not a repeat alone', () => {
    const song = 'Verse 1\nOne\n\nVerse 2\nTwo'
    expect(follow(song, 'Verse 1\nOne\n\nVerse 2\nTwo more', []).rename).toBeNull()
  })

  it('puts the heading back when the words become a repeat again', () => {
    const first = follow(REPEATS, typed(REPEATS), [])
    // As the editor holds it after the rename: the heading reads VERSE 2.
    const lines = typed(REPEATS).split('\n')
    expect(lines[6]).toBe('VERSE')
    lines[6] = 'VERSE 2'
    const after = lines.join('\n')
    lines[7] = lines[7].replace('X', '')
    const back = follow(after, lines.join('\n'), first.renamed)
    expect(back.rename).toEqual({ index: 2, from: 'VERSE 2', to: 'VERSE' })
    expect(back.renamed).toEqual([])
  })

  it('starts afresh when a heading is added, removed or retitled', () => {
    const prior: HeadingRename[] = [{ index: 2, from: 'VERSE', to: 'VERSE 2' }]
    const retitled = REPEATS.replace('INTRO', 'Intro')
    expect(follow(REPEATS, retitled, prior)).toEqual({ rename: null, renamed: [] })
  })
})

describe('the sequence', () => {
  it('lists the sections in the order they are sung', () => {
    expect(lyricSequence(REPEATS)).toEqual([
      'Intro',
      'Verse',
      'Verse',
      'Chorus',
      'Verse',
      'Chorus 2',
    ])
    expect(lyricSequence('Just words\nNo headings')).toEqual([])
    expect(lyricSequence('Stray line\n\nVerse 1\nWords')).toEqual(['Verse 1'])
  })

  it('shortens to the pills, repeat counts included', () => {
    expect(sequenceSteps(['Intro', 'Verse 2', 'Chorus ×2', 'Pre-Chorus']).map((s) => s.short))
      .toEqual(['I', 'V2', 'C×2', 'PC'])
    expect(sequenceSteps(['Verse 2'])[0]).toEqual({ label: 'Verse 2', short: 'V2', kind: 'verse' })
    expect(sequenceSteps(['Whatever'])[0].short).toBe('Whatever')
  })

  it('keys "Verse" and "Verse 1" alike, ignoring a repeat count', () => {
    expect(sectionKeyOf('VERSE')).toBe(sectionKeyOf('[Verse 1]'))
    expect(sectionKeyOf('Chorus x2')).toBe(sectionKeyOf('Chorus'))
    expect(sectionKeyOf('Verse 2')).not.toBe(sectionKeyOf('Verse'))
    expect(sectionKeyOf('Amazing grace')).toBeNull()
  })
})

describe('a plan’s own sequence', () => {
  const lyrics = 'Intro\n\nVerse 1\nOne\n\nChorus\nSing\n\nVerse 2\nTwo\n\nChorus\nSing'

  it('starts from the version’s saved sequence, else its headings', () => {
    expect(songSequenceOf({ lyrics, sequence: ['Verse 1', 'Chorus'] })).toEqual([
      'Verse 1',
      'Chorus',
    ])
    expect(songSequenceOf({ lyrics, sequence: null })).toEqual([
      'Intro',
      'Verse 1',
      'Chorus',
      'Verse 2',
      'Chorus',
    ])
    expect(songSequenceOf(null)).toEqual([])
  })

  it('offers each section once, then any the saved sequence still names', () => {
    expect(sequenceChoices(lyrics, ['Bridge', 'Chorus'])).toEqual([
      'Intro',
      'Verse 1',
      'Chorus',
      'Verse 2',
      'Bridge',
    ])
  })

  it('compares order as well as sections', () => {
    expect(sameSequence(['Verse 1', 'Chorus'], ['Verse 1', 'Chorus'])).toBe(true)
    expect(sameSequence(['Chorus', 'Verse 1'], ['Verse 1', 'Chorus'])).toBe(false)
    expect(sameSequence(['Chorus'], ['Chorus', 'Chorus'])).toBe(false)
  })
})

describe('chords tell sections apart', () => {
  // "No One Like The Lord" as it is now: the second VERSE's words match the
  // first, but its second chord is a 1 where the first has a 4.
  const lyrics = 'INTRO\n\nVERSE\nThere is One\nHe is worthy\n\nVERSE\nThere is One\nHe is worthy\n\nVERSE\nThere is One\nHe is worthy'
  const chords = 'INTRO\n[6m] / [5/7] /\nVERSE\n[6m]Ther[4]e is One\n[6m]He is worthy\n\nVERSE\n[6m]Ther[1]e is One\n[6m]He is worthy\n\nVERSE\n[6m]Th[4]ere is One\n[6m]He is worthy'

  it('reads the chords line by line, wherever they sit', () => {
    expect(lyricChords('[6m]Ther[4]e is\n\n[1]One')).toBe('6m 4\n\n1')
    expect(lyricChords('no chords')).toBe('')
  })

  it('warns about one heading over different chords', () => {
    expect(conflicts(lyrics, chords)).toEqual(['VERSE'])
    expect(conflicts(lyrics)).toEqual([])
  })

  it('numbers them: the first 1, the different one 2, the repeat with its twin', () => {
    expect(numberSharedHeadings({ lyrics, chords })).toEqual([
      { index: 1, from: 'VERSE', to: 'VERSE 1' },
      { index: 2, from: 'VERSE', to: 'VERSE 2' },
      { index: 3, from: 'VERSE', to: 'VERSE 1' },
    ])
    expect(numberSharedHeadings({ lyrics })).toEqual([])
  })

  it('renumbers a repeat whose chords are changed', () => {
    const same = chords.replace('Ther[1]e', 'Ther[4]e')
    const { rename } = followSectionEdit({ lyrics, chords: same }, { lyrics, chords }, [])
    expect(rename).toEqual({ index: 2, from: 'VERSE', to: 'VERSE 2' })
  })
})

describe('chords written on one copy of a section only', () => {
  // "10,000 Reasons": the first chorus charted, the two after it left bare.
  const chorus = 'Chorus\nBless the Lord O my soul\nO my soul'
  const lyrics = `${chorus}\n\nVerse 1\nThe sun comes up\n\n${chorus}\n\n${chorus}`
  const chorded = 'Chorus\n[4]Bless the Lord,[1] O my soul,\n[5/7]O my [6m]soul,'

  it('is still a repeat, not a different section', () => {
    expect(sameSection(sectionContent('a b', '[1]a b'), sectionContent('a b'))).toBe(true)
    expect(sameSection(sectionContent('a b', '[1]a'), sectionContent('a b', '[4]a'))).toBe(
      false,
    )
    expect(conflicts(lyrics, chorded)).toEqual([])
    expect(numberSharedHeadings({ lyrics, chords: chorded })).toEqual([])
  })

  it('does not renumber the chorus its chords were added to', () => {
    const { rename } = followSectionEdit({ lyrics }, { lyrics, chords: chorded }, [])
    expect(rename).toBeNull()
  })

  it('keeps two differently charted copies apart, with a bare third', () => {
    const second = `\n\n\n\n\n${chorded.replace('[6m]', '[2m]')}`
    const chords = `${chorded}${second}`
    expect(conflicts(lyrics, chords)).toEqual(['Chorus'])
    // The bare one goes with the first charted chorus.
    expect(numberSharedHeadings({ lyrics, chords })).toEqual([
      { index: 0, from: 'Chorus', to: 'Chorus 1' },
      { index: 2, from: 'Chorus', to: 'Chorus 2' },
      { index: 3, from: 'Chorus', to: 'Chorus 1' },
    ])
  })
})
