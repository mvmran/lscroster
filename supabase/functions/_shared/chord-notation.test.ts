// Tests for the Edge Function copy of the chord converter.
//
// Run with:
//   deno test supabase/functions
//
// These deliberately mirror src/features/services/chord-notation.test.ts: the
// two copies of the converter must agree, and this is what says they do.

import { assertEquals } from 'jsr:@std/assert@1'
import {
  chordsToLetters,
  chordsToNumbers,
  parseSongKey,
} from './chord-notation.ts'

const G = parseSongKey('G')
const Am = parseSongKey('Am')
const Eb = parseSongKey('Eb')

Deno.test('parseSongKey reads a tonic and ignores the mode', () => {
  assertEquals(parseSongKey('G'), parseSongKey('G minor'))
  assertEquals(parseSongKey('g'), parseSongKey('G'))
  assertEquals(parseSongKey('F#m'), { letter: 3, pitch: 6 })
})

Deno.test('parseSongKey is null when there is no key to read', () => {
  assertEquals(parseSongKey(null), null)
  assertEquals(parseSongKey(''), null)
  assertEquals(parseSongKey('unknown'), null)
  // A near-miss is refused rather than read as G.
  assertEquals(parseSongKey('Gee'), null)
  assertEquals(parseSongKey('G capo 2'), null)
})

Deno.test('chordsToLetters reads numbers back in a major key', () => {
  assertEquals(chordsToLetters('[1] [2m] [4] [5] [6m]', G), '[G] [Am] [C] [D] [Em]')
})

Deno.test('chordsToLetters counts a minor key from its own tonic', () => {
  assertEquals(chordsToLetters('[1m] [b3] [4m] [b6] [b7]', Am), '[Am] [C] [Dm] [F] [G]')
})

Deno.test('chordsToLetters spells a flat key with flats', () => {
  assertEquals(chordsToLetters('[1] [4] [5] [6m]', Eb), '[Eb] [Ab] [Bb] [Cm]')
})

Deno.test('chordsToLetters keeps the quality and both halves of a slash', () => {
  assertEquals(chordsToLetters('[4maj7] [57sus4] [1/3]', G), '[Cmaj7] [D7sus4] [G/B]')
})

Deno.test('chordsToLetters converts a ChordPro line and leaves the words', () => {
  assertEquals(
    chordsToLetters('[1]Amazing [4]grace how [5]sweet', G),
    '[G]Amazing [C]grace how [D]sweet',
  )
})

Deno.test('chordsToLetters leaves a bracketed word or repeat marker alone', () => {
  assertEquals(chordsToLetters('[Bridge] [2x] [Capo 2]', G), '[Bridge] [2x] [Capo 2]')
})

Deno.test('chordsToLetters is a no-op on a layer already in letters', () => {
  const letters = '[G] [Cmaj7] [D/F#]'
  assertEquals(chordsToLetters(letters, G), letters)
})

Deno.test('chordsToLetters leaves everything alone without a key', () => {
  assertEquals(chordsToLetters('[1] [4]', null), '[1] [4]')
})

Deno.test('chordsToLetters keeps every line of a layer in step', () => {
  assertEquals(chordsToLetters('[1]\n\n[4] [5]\n', G), '[G]\n\n[C] [D]\n')
})

Deno.test('a chord survives letters -> numbers -> letters in every key', () => {
  const chords = '[G] [Am7] [Bb] [A#] [C/E] [F#dim] [Dsus4] [Ebmaj9] [Gm] [D/F#]'
  for (const key of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Am']) {
    const parsed = parseSongKey(key)
    assertEquals(chordsToLetters(chordsToNumbers(chords, parsed), parsed), chords, key)
  }
})

Deno.test('chordsToLetters reads a measure back, bars and beats intact', () => {
  // Instrumental sections are stored as measures. The projection API converts
  // them like any other chord, so the client and this copy must agree.
  const A = parseSongKey('A')
  assertEquals(
    chordsToLetters('[| 6m / / / | 4 / / / | 1 / / / | 5 / / / |]', A),
    '[| F#m / / / | D / / / | A / / / | E / / / |]',
  )
  assertEquals(chordsToLetters('[| 1  |]', A), '[| A  |]')
})

Deno.test('a measure survives letters -> numbers -> letters', () => {
  const A = parseSongKey('A')
  const outro = '[| F#m / / / | D / / / | A / / / | E / / / |]'
  assertEquals(chordsToLetters(chordsToNumbers(outro, A), A), outro)
})

Deno.test('chordsToLetters leaves N.C. alone', () => {
  assertEquals(chordsToLetters('[N.C.]', parseSongKey('A')), '[N.C.]')
})
