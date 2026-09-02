import { describe, expect, it } from 'vitest'
import {
  chordsIn,
  chordsToLetters,
  chordsToNumbers,
  hasChordTokens,
  isChordToken,
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

describe('bar-and-beat measures', () => {
  const A = parseSongKey('A')

  it('numbers every chord of a measure and keeps the bars and beats', () => {
    // An outro is written as measures, not against words. The spacing is the
    // rhythm, so it has to survive the round trip character for character.
    const outro = '[| F#m / / / | D / / / | A / / / | E / / / |]'
    const stored = '[| 6m / / / | 4 / / / | 1 / / / | 5 / / / |]'
    expect(chordsToNumbers(outro, A)).toBe(stored)
    expect(chordsToLetters(stored, A)).toBe(outro)
  })

  it('keeps a single-chord measure and its spacing', () => {
    expect(chordsToNumbers('[| A  |]', A)).toBe('[| 1  |]')
    expect(chordsToLetters('[| 1  |]', A)).toBe('[| A  |]')
  })

  it('transposes a measure with the rest of the song', () => {
    const stored = '[| 6m / / / | 4 / / / |]'
    expect(chordsToLetters(stored, parseSongKey('G'))).toBe('[| Em / / / | C / / / |]')
  })

  it('counts a measure as chords, and prose as prose', () => {
    expect(isChordToken('| F#m / / / | D / / / |')).toBe(true)
    expect(isChordToken('| A |')).toBe(true)
    expect(isChordToken('N.C.')).toBe(true)
    expect(isChordToken('NC')).toBe(true)
    // A bar line alone is not a chord, and neither is a note to the band.
    expect(isChordToken('| repeat |')).toBe(false)
    expect(isChordToken('| / / / |')).toBe(false)
    expect(isChordToken('Verse 1')).toBe(false)
    expect(isChordToken('x2')).toBe(false)
  })

  it('leaves N.C. alone in both directions', () => {
    expect(chordsToNumbers('[N.C.]', A)).toBe('[N.C.]')
    expect(chordsToLetters('[N.C.]', A)).toBe('[N.C.]')
  })
})

describe('a run of chords in one bracket', () => {
  const E = parseSongKey('E')

  it('counts a bar-less run as chords', () => {
    // How a site publishing ChordPro writes an intro: the whole run in one
    // bracket, no bar lines, because there are no words to hang it on.
    expect(isChordToken('C#m E B Amaj7')).toBe(true)
    expect(isChordToken('G  C')).toBe(true)
    expect(isChordToken('D / / /')).toBe(true)
  })

  it('reads a group of beat slashes as beats, not as a word', () => {
    // How Set A Fire's intro is published: each measure is its chord and the
    // beats holding it, written as one group rather than separated slashes.
    expect(isChordToken('| C2 /// | F2 /// | Am7 /// | F2 /// |')).toBe(true)
    expect(isChordToken('| G //// | D //// |')).toBe(true)
    expect(isChordToken('C2 /// F2')).toBe(true)
  })

  it('still reads a note to the band as prose', () => {
    // Every piece has to be a chord, and the suffix whitelist fails an
    // ordinary word on its second letter — which is what keeps these out.
    expect(isChordToken('Capo 2')).toBe(false)
    expect(isChordToken('Verse 1')).toBe(false)
    expect(isChordToken('play twice')).toBe(false)
    expect(isChordToken('/ /')).toBe(false)
    expect(isChordToken('/// ///')).toBe(false)
    expect(isChordToken('| /// | /// |')).toBe(false)
  })

  it('numbers every chord of a run and keeps the spacing', () => {
    expect(chordsToNumbers('[C#m E B Amaj7]', E)).toBe('[6m 1 5 4maj7]')
    expect(chordsToLetters('[6m 1 5 4maj7]', E)).toBe('[C#m E B Amaj7]')
    expect(chordsToNumbers('[C#m  E]', E)).toBe('[6m  1]')
  })

  it('numbers a run of measures, keeping the bars and beat groups', () => {
    const C = parseSongKey('C')
    expect(chordsToNumbers('[| C2 /// | F2 /// | Am7 /// | F2 /// |]', C)).toBe(
      '[| 12 /// | 42 /// | 6m7 /// | 42 /// |]',
    )
    expect(chordsToLetters('[| 12 /// | 42 /// | 6m7 /// | 42 /// |]', C)).toBe(
      '[| C2 /// | F2 /// | Am7 /// | F2 /// |]',
    )
  })

  it('leaves prose whole rather than renumbering part of it', () => {
    // Converted piece by piece the `1` would come back as a chord letter.
    expect(chordsToLetters('[Verse 1]', E)).toBe('[Verse 1]')
    expect(chordsToNumbers('[Capo 2]', E)).toBe('[Capo 2]')
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
