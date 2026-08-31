import { describe, expect, it } from 'vitest'
import {
  matchLyricSectionHeader,
  parseLyricSections,
} from '@/features/services/lyric-sections'

describe('matchLyricSectionHeader', () => {
  it('matches bracketed, bare, parenthesized and colon styles', () => {
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

  it('collects non-blank text before the first header as Unlabeled', () => {
    const text = 'Oh oh oh\n\n[Verse 1]\nAmazing grace'
    const sections = parseLyricSections(text)
    expect(sections.map((s) => s.label)).toEqual(['Unlabeled', 'Verse 1'])
    expect(sections[0].start).toBe(0)
    expect(sections[0].bodyStart).toBe(0)
    expect(sections[0].end).toBe(text.indexOf('[Verse 1]'))
  })

  it('ignores blank leading whitespace (no Unlabeled section)', () => {
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
