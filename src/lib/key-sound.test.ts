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
  it('is the full chord: root and fifth low, the 3rd an octave up', () => {
    expect(padNotes({ tonic: 7, minor: false })).toEqual([43, 50, 55, 59, 62]) // G B D
    expect(padNotes({ tonic: 0, minor: true })).toEqual([48, 55, 60, 63, 67]) // C Eb G
  })
})
