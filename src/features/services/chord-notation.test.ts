import { describe, expect, it } from 'vitest'
import {
  chordsIn,
  chordsToLetters,
  chordsToNumbers,
  hasChordTokens,
  parseSongKey,
} from '@/features/services/chord-notation'

const G = parseSongKey('G')
const Am = parseSongKey('Am')
const Eb = parseSongKey('Eb')

describe('parseSongKey', () => {
  it('reads a tonic and ignores the mode', () => {
    expect(parseSongKey('G')).toEqual(parseSongKey('G minor'))
    expect(parseSongKey('g')).toEqual(parseSongKey('G'))
    expect(parseSongKey(' Bb ')).toEqual(parseSongKey('Bbm'))
  })

  it('reads a sharp or flat tonic', () => {
    expect(parseSongKey('F#m')).toEqual({ letter: 3, pitch: 6 })
    expect(parseSongKey('Bb major')).toEqual({ letter: 6, pitch: 10 })
  })

  it('is null when there is no key to read', () => {
    expect(parseSongKey(null)).toBeNull()
    expect(parseSongKey('')).toBeNull()
    expect(parseSongKey('  ')).toBeNull()
    expect(parseSongKey('unknown')).toBeNull()
  })

  it('refuses a near-miss rather than reading its first letter', () => {
    // "Gee" is not the key of G: storing chords against a guess would give
    // the band a chart in the wrong key with nothing to show it was guessed.
    expect(parseSongKey('Gee')).toBeNull()
    expect(parseSongKey('G capo 2')).toBeNull()
    expect(parseSongKey('Dm7')).toBeNull()
  })
})

describe('chordsToNumbers', () => {
  it('numbers a major key from its tonic', () => {
    expect(chordsToNumbers('[G] [Am] [C] [D] [Em]', G)).toBe('[1] [2m] [4] [5] [6m]')
  })

  it('numbers a minor key from its own tonic, not the relative major', () => {
    expect(chordsToNumbers('[Am] [C] [Dm] [F] [G]', Am)).toBe('[1m] [b3] [4m] [b6] [b7]')
  })

  it('keeps the quality and extensions verbatim', () => {
    // A seventh reads as "57" in plain text — the degree is always the first
    // digit, so it parses back exactly, and the toggle is there for anyone who
    // would rather read "D7".
    expect(chordsToNumbers('[Cmaj7] [D7sus4] [F#m7b5] [Gadd9]', G)).toBe(
      '[4maj7] [57sus4] [7m7b5] [1add9]',
    )
  })

  it('numbers both halves of a slash chord', () => {
    expect(chordsToNumbers('[G/B] [C/E]', G)).toBe('[1/3] [4/6]')
  })

  it('spells an accidental from the letter it was written with', () => {
    // Both are the same pitch; the letter decides which degree it is.
    expect(chordsToNumbers('[Bb]', G)).toBe('[b3]')
    expect(chordsToNumbers('[A#]', G)).toBe('[#2]')
  })

  it('converts a full ChordPro line and leaves the words alone', () => {
    expect(chordsToNumbers('[G]Amazing [C]grace how [D]sweet', G)).toBe(
      '[1]Amazing [4]grace how [5]sweet',
    )
  })

  it('leaves a bracketed word alone', () => {
    expect(chordsToNumbers('[Bridge] [Chorus] [x2] [Capo 2]', G)).toBe(
      '[Bridge] [Chorus] [x2] [Capo 2]',
    )
  })

  it('is a no-op on a layer already in numbers', () => {
    const numbers = '[1] [4] [5m7] [1/3]'
    expect(chordsToNumbers(numbers, G)).toBe(numbers)
  })

  it('leaves everything alone when the arrangement has no key', () => {
    expect(chordsToNumbers('[G] [C]', null)).toBe('[G] [C]')
  })

  it('keeps every line of a layer in step', () => {
    expect(chordsToNumbers('[G]\n\n[C] [D]\n', G)).toBe('[1]\n\n[4] [5]\n')
  })
})

describe('chordsToLetters', () => {
  it('reads numbers back in the key', () => {
    expect(chordsToLetters('[1] [2m] [4] [5] [6m]', G)).toBe('[G] [Am] [C] [D] [Em]')
    expect(chordsToLetters('[1m] [b3] [4m] [b6] [b7]', Am)).toBe(
      '[Am] [C] [Dm] [F] [G]',
    )
  })

  it('spells a flat key with flats', () => {
    expect(chordsToLetters('[1] [4] [5] [6m]', Eb)).toBe('[Eb] [Ab] [Bb] [Cm]')
  })

  it('is a no-op on a layer already in letters', () => {
    const letters = '[G] [Cmaj7] [D/F#]'
    expect(chordsToLetters(letters, G)).toBe(letters)
  })

  it('leaves a repeat marker alone', () => {
    expect(chordsToLetters('[2x] [1]', G)).toBe('[2x] [G]')
  })
})

describe('round trip', () => {
  const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Am', 'C#m']
  const chords = '[G] [Am7] [Bb] [A#] [C/E] [F#dim] [Dsus4] [Ebmaj9] [Gm] [D/F#]'

  it.each(keys)('survives letters → numbers → letters in %s', (key) => {
    const parsed = parseSongKey(key)
    expect(chordsToLetters(chordsToNumbers(chords, parsed), parsed)).toBe(chords)
  })
})

describe('chordsIn', () => {
  it('returns the stored numbers untouched, or letters in the key', () => {
    expect(chordsIn('[1] [4]', 'numbers', G)).toBe('[1] [4]')
    expect(chordsIn('[1] [4]', 'letters', G)).toBe('[G] [C]')
    expect(chordsIn('[1] [4]', 'letters', null)).toBe('[1] [4]')
  })
})

describe('hasChordTokens', () => {
  it('is true only for a bracketed chord', () => {
    expect(hasChordTokens('[G]')).toBe(true)
    expect(hasChordTokens('[1]Amazing')).toBe(true)
    expect(hasChordTokens('G C D')).toBe(false)
    expect(hasChordTokens('')).toBe(false)
    expect(hasChordTokens(null)).toBe(false)
    expect(hasChordTokens('[unclosed')).toBe(false)
  })
})
