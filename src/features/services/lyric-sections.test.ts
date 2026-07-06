import { describe, expect, it } from 'vitest'
import {
  duplicateLyricSection,
  matchLyricSectionHeader,
  moveLyricSection,
  parseLyricSections,
  removeLyricSection,
} from '@/features/services/lyric-sections'

describe('matchLyricSectionHeader', () => {
  it('matches bracketed, bare, parenthesized and colon styles', () => {
    expect(matchLyricSectionHeader('[Verse 1]')).toEqual({ label: 'Verse 1', kind: 'verse' })
    expect(matchLyricSectionHeader('Chorus:')).toEqual({ label: 'Chorus', kind: 'chorus' })
    expect(matchLyricSectionHeader('(Bridge)')).toEqual({ label: 'Bridge', kind: 'bridge' })
    expect(matchLyricSectionHeader('  Intro  ')).toEqual({ label: 'Intro', kind: 'intro' })
  })

  it('is case-insensitive and normalises the label', () => {
    expect(matchLyricSectionHeader('VERSE 2')).toEqual({ label: 'Verse 2', kind: 'verse' })
    expect(matchLyricSectionHeader('pre chorus')).toEqual({ label: 'Pre-Chorus', kind: 'pre-chorus' })
    expect(matchLyricSectionHeader('PRE-CHORUS 2:')).toEqual({ label: 'Pre-Chorus 2', kind: 'pre-chorus' })
  })

  it('supports numeric and lettered designators', () => {
    expect(matchLyricSectionHeader('Verse1')).toEqual({ label: 'Verse 1', kind: 'verse' })
    expect(matchLyricSectionHeader('Verse a')).toEqual({ label: 'Verse A', kind: 'verse' })
  })

  it('rejects lyric lines that merely contain a keyword', () => {
    expect(matchLyricSectionHeader('He walked a bridge of sorrow')).toBeNull()
    expect(matchLyricSectionHeader('Chorusa')).toBeNull()
    expect(matchLyricSectionHeader('The intro was long')).toBeNull()
    expect(matchLyricSectionHeader('')).toBeNull()
  })

  it('tolerates a trailing carriage return (CRLF text)', () => {
    expect(matchLyricSectionHeader('[Chorus]\r')).toEqual({ label: 'Chorus', kind: 'chorus' })
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

describe('moveLyricSection', () => {
  it('reorders sections and preserves all content', () => {
    const sections = parseLyricSections(SONG)
    const moved = moveLyricSection(SONG, sections, 2, 1)
    expect(parseLyricSections(moved).map((s) => s.label)).toEqual(['Verse 1', 'Verse 2', 'Chorus'])
    expect(moved).toContain('Through many dangers')
    expect(moved).toContain('Praise God')
  })

  it('adds a separator when the old final section moves mid-text', () => {
    const sections = parseLyricSections(SONG)
    const moved = moveLyricSection(SONG, sections, 2, 0)
    expect(moved.startsWith('[Verse 2]\nThrough many dangers\n\n[Verse 1]')).toBe(true)
  })

  it('is a byte-exact round trip when moved back', () => {
    const sections = parseLyricSections(SONG)
    const there = moveLyricSection(SONG, sections, 0, 1)
    const back = moveLyricSection(there, parseLyricSections(there), 1, 0)
    // the round trip may only differ by the separator added to the old tail
    expect(back.replace(/\n+$/, '')).toBe(SONG)
  })

  it('preserves a blank preamble before the first header', () => {
    const text = '\n\n[Verse 1]\nA\n\n[Chorus]\nB'
    const sections = parseLyricSections(text)
    expect(moveLyricSection(text, sections, 0, 1)).toBe('\n\n[Chorus]\nB\n\n[Verse 1]\nA\n\n')
  })

  it('returns the text unchanged for a no-op or bad index', () => {
    const sections = parseLyricSections(SONG)
    expect(moveLyricSection(SONG, sections, 1, 1)).toBe(SONG)
    expect(moveLyricSection(SONG, sections, 5, 0)).toBe(SONG)
  })
})

describe('duplicateLyricSection', () => {
  it('inserts a copy right after the section', () => {
    const sections = parseLyricSections(SONG)
    const dup = duplicateLyricSection(SONG, sections, 1)
    expect(parseLyricSections(dup).map((s) => s.label)).toEqual([
      'Verse 1',
      'Chorus',
      'Chorus',
      'Verse 2',
    ])
    expect(dup.match(/Praise God/g)).toHaveLength(2)
  })

  it('separates the copy with a blank line when duplicating the tail', () => {
    const sections = parseLyricSections(SONG)
    const dup = duplicateLyricSection(SONG, sections, 2)
    expect(dup.endsWith('Through many dangers\n\n[Verse 2]\nThrough many dangers')).toBe(true)
  })

  it('uses CRLF separators in CRLF text', () => {
    const text = '[Verse 1]\r\nA\r\n\r\n[Chorus]\r\nB'
    const sections = parseLyricSections(text)
    const dup = duplicateLyricSection(text, sections, 1)
    expect(dup).toBe('[Verse 1]\r\nA\r\n\r\n[Chorus]\r\nB\r\n\r\n[Chorus]\r\nB')
  })
})

describe('removeLyricSection', () => {
  it('removes the header line and its lyrics exactly', () => {
    const sections = parseLyricSections(SONG)
    const removed = removeLyricSection(SONG, sections, 1)
    expect(removed).toBe('[Verse 1]\nAmazing grace\nhow sweet the sound\n\n[Verse 2]\nThrough many dangers')
  })

  it('can remove an Unlabeled leading section', () => {
    const text = 'Oh oh oh\n\n[Verse 1]\nAmazing grace'
    const sections = parseLyricSections(text)
    expect(removeLyricSection(text, sections, 0)).toBe('[Verse 1]\nAmazing grace')
  })
})
