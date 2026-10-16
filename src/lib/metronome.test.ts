import { describe, expect, it } from 'vitest'
import { clickPattern, parseMeter } from '@/lib/metronome'

describe('parseMeter', () => {
  it('reads time signatures, with or without spaces', () => {
    expect(parseMeter('4/4')).toEqual({ beats: 4, unit: 4 })
    expect(parseMeter(' 6 / 8 ')).toEqual({ beats: 6, unit: 8 })
  })

  it('rejects anything that is not one', () => {
    for (const m of [null, undefined, '', 'free', '4/5', '0/4', '4-4', '4/4/4']) {
      expect(parseMeter(m)).toBeNull()
    }
  })
})

describe('clickPattern', () => {
  it('is a plain click with no meter', () => {
    expect(clickPattern(null)).toEqual({ bar: ['beat'], clicksPerBeat: 1 })
    expect(clickPattern('free time')).toEqual({ bar: ['beat'], clicksPerBeat: 1 })
  })

  it('accents beat 1 in simple meters', () => {
    expect(clickPattern('4/4')).toEqual({
      bar: ['accent', 'beat', 'beat', 'beat'],
      clicksPerBeat: 1,
    })
    expect(clickPattern('3/4').bar).toEqual(['accent', 'beat', 'beat'])
    expect(clickPattern('7/8').bar).toHaveLength(7)
  })

  it('counts the dotted pulse in compound meters', () => {
    expect(clickPattern('6/8')).toEqual({
      bar: ['accent', 'sub', 'sub', 'beat', 'sub', 'sub'],
      clicksPerBeat: 3,
    })
    expect(clickPattern('12/8').bar.filter((k) => k !== 'sub')).toHaveLength(4)
    // 3/8 is one beat of three, not compound.
    expect(clickPattern('3/8')).toEqual({ bar: ['accent', 'beat', 'beat'], clicksPerBeat: 1 })
  })
})
