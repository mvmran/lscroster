import { describe, expect, it } from 'vitest'
import { cadenceChords, padNotes } from '@/lib/key-sound'

describe('cadenceChords', () => {
  it('plays I–IV–V–I in G around middle C', () => {
    // G = 7, so the tonic sits below middle C (55) and the triads stay central.
    expect(cadenceChords({ tonic: 7, minor: false })).toEqual([
      { bass: 43, notes: [55, 59, 62] },
      { bass: 48, notes: [55, 60, 64] },
      { bass: 50, notes: [54, 57, 62] },
      { bass: 43, notes: [55, 59, 62] },
    ])
  })

  it('uses the minor i and iv, with the major V, in a minor key', () => {
    const [i, iv, v] = cadenceChords({ tonic: 9, minor: true }) // A minor
    expect(i.notes).toEqual([57, 60, 64]) // A C E
    expect(iv.notes).toEqual([57, 62, 65]) // A D F
    expect(v.notes).toEqual([56, 59, 64]) // G# B E
  })
})

describe('padNotes', () => {
  it('defaults to Dark Warm: add9 with the 3rd (1-5 · 3-5-9)', () => {
    expect(padNotes({ tonic: 7, minor: false })).toEqual([43, 50, 59, 62, 69]) // G D · B D A
    expect(padNotes({ tonic: 7, minor: true })).toEqual([43, 50, 58, 62, 69]) // B♭ for minor
  })

  it('follows the voicing and octave asked for', () => {
    expect(padNotes({ tonic: 7, minor: false }, { voicing: 'full', octave: 0 })).toEqual([43, 50, 55, 59, 62])
    expect(padNotes({ tonic: 0, minor: true }, { voicing: 'full', octave: 0 })).toEqual([48, 55, 60, 63, 67])
    expect(padNotes({ tonic: 7, minor: false }, { voicing: 'fifths', octave: 1 })).toEqual([55, 62, 67, 74])
  })
})
