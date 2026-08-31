import { describe, expect, it } from 'vitest'
import {
  hasMetadata,
  stripDirectives,
  EMPTY_METADATA,
} from '@/features/services/chordpro-directives'

const FILE = [
  '{title:It Is Well With My Soul}',
  '{artist:Reawaken Hymns}',
  '{key: C}',
  '{tempo: 82}',
  '{time: 4/4}',
  '',
  '{comment: Verse 2}',
  'When p[C]eace, like a river,',
].join('\n')

describe('stripDirectives', () => {
  it('reads what the file says about itself', () => {
    expect(stripDirectives(FILE).metadata).toEqual({
      title: 'It Is Well With My Soul',
      artist: 'Reawaken Hymns',
      key: 'C',
      bpm: 82,
      meter: '4/4',
    })
  })

  it('leaves no directive behind as a lyric', () => {
    // The bug this exists for: a directive that survives is a line to sing.
    // Dropped outright rather than left as blank lines: a blank would read as
    // a paragraph break and split the song where the header block used to be.
    expect(stripDirectives(FILE).text).toBe(
      ['', 'Verse 2', 'When p[C]eace, like a river,'].join('\n'),
    )
  })

  it('turns a comment that names a section into a header', () => {
    expect(stripDirectives('{comment:Intro}').text).toBe('Intro')
    expect(stripDirectives('{comment: Chorus x3}').text).toBe('Chorus ×3')
    expect(stripDirectives('{c: Bridge}').text).toBe('Bridge')
  })

  it('keeps a comment that is a note to the band, without its braces', () => {
    expect(stripDirectives('{comment: Capo 2}').text).toBe('Capo 2')
    expect(stripDirectives('{comment: watch the drummer}').text).toBe(
      'watch the drummer',
    )
  })

  it('reads the short forms', () => {
    expect(stripDirectives('{t: Song}\n{a: Band}\n{k: G}').metadata).toMatchObject({
      title: 'Song',
      artist: 'Band',
      key: 'G',
    })
  })

  it('names a section from a start_of directive and drops its end', () => {
    expect(stripDirectives('{start_of_chorus}\nsing\n{end_of_chorus}').text).toBe(
      'Chorus\nsing',
    )
    expect(stripDirectives('{soc}\nsing\n{eoc}').text).toBe('Chorus\nsing')
  })

  it('drops a directive it does not know rather than singing it', () => {
    expect(stripDirectives('{ccli: 25376}\n{x_custom: whatever}').text).toBe('')
  })

  it('ignores a tempo that is not a tempo', () => {
    expect(stripDirectives('{tempo: fast}').metadata.bpm).toBeNull()
    expect(stripDirectives('{tempo: 0}').metadata.bpm).toBeNull()
  })

  it('keeps the first value when a directive repeats', () => {
    expect(stripDirectives('{key: C}\n{key: G}').metadata.key).toBe('C')
  })

  it('is idempotent — the result holds no directives', () => {
    const once = stripDirectives(FILE).text
    expect(stripDirectives(once).text).toBe(once)
  })

  it('leaves a paste with no directives exactly as it was', () => {
    const plain = 'Verse 1\n[G]Amazing grace'
    expect(stripDirectives(plain)).toEqual({
      text: plain,
      metadata: EMPTY_METADATA,
    })
  })

  it('does not mistake a chord or a bracketed header for a directive', () => {
    const line = '[C] [Dm] [F] [G]'
    expect(stripDirectives(line).text).toBe(line)
    expect(stripDirectives('[Verse 1]').text).toBe('[Verse 1]')
  })
})

describe('hasMetadata', () => {
  it('is false only when the file said nothing usable', () => {
    expect(hasMetadata(EMPTY_METADATA)).toBe(false)
    expect(hasMetadata({ ...EMPTY_METADATA, key: 'C' })).toBe(true)
  })
})
