/**
 * Chords in letter and number notation.
 *
 * A chord layer is stored in **numbers** — the Nashville system, where a chord
 * is named by its degree of the key ("1", "4", "6m") rather than by its letter
 * ("G", "C", "Em"). One stored text then reads correctly in every key: the
 * arrangement's key turns it back into letters, and a plan that transposes a
 * song simply supplies a different key.
 *
 * Both notations are typed the same way, wrapped in `[…]` (see
 * `splitChordLine`), so everything outside a bracket — a lyric syllable in a
 * ChordPro line, a note to the band — is carried through untouched.
 *
 * ## Spelling
 *
 * Conversion works on the chord's **letter**, not its pitch, so a chord keeps
 * the spelling it was written with. In G, `Bb` is degree 3 (the letter B)
 * flattened, so it is `b3` and comes back as `Bb`; `A#` is degree 2 sharpened,
 * `#2`, and comes back as `A#`. A pitch-only conversion would have to pick one
 * of each enharmonic pair and would rewrite half of them.
 *
 * Degrees are counted from the key's own tonic whether the key is major or
 * minor, which is what makes a minor key read naturally: in Am, C is `b3`,
 * F is `b6` and G is `b7`.
 *
 * ## Leaving things alone
 *
 * Anything that is not a chord in the notation being converted **from** is
 * returned unchanged. A letter chord is never a valid number and a number is
 * never a valid letter, so the two conversions can be run over any text, in
 * any order, without damaging it: `chordsToNumbers` on a text already in
 * numbers is a no-op, which is what lets it run over the buffer on every save
 * and quietly convert a layer written before this existed.
 */

import { splitChordLine } from '@/features/services/lyric-layers'

/** Which notation a chord layer is being read or typed in. */
export type ChordNotation = 'letters' | 'numbers'

/** A parsed key: the tonic's letter and pitch. Major or minor is irrelevant. */
export interface SongKey {
  /** Index into `LETTERS` — 0 is C. */
  letter: number
  /** Semitones above C, accidental included. */
  pitch: number
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
/** Semitones above C of each natural note, in `LETTERS` order. */
const NATURAL = [0, 2, 4, 5, 7, 9, 11]
/** Semitones above the tonic of each degree of the major scale. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/**
 * What may follow a chord's root: qualities, extensions and their accidentals.
 *
 * A whitelist rather than "any letter", because a chord line carries prose too
 * — a bracketed `[Bridge]` or `[Chorus x2]` must not be read as a B chord with
 * a suffix of "ridge". Every alternative is a whole token, so only text built
 * entirely from them parses as a chord.
 */
const SUFFIX =
  /^(?:maj|Maj|min|sus|add|dim|aug|m|M|\d+|[#b♯♭]|[+\-°ø()])*$/

/**
 * A chord's root in letter notation: `A`–`G` with any accidentals.
 *
 * Upper case only. A chord root is always written upper case, and insisting on
 * it keeps a bracketed lower-case word out of the conversion — `[bass]` is a
 * note to the band, not a B chord.
 */
const CHORD_ROOT = /^([A-G])([#b♯♭]*)/
/**
 * A whole key: a tonic, and at most a word saying major or minor.
 *
 * Anchored at both ends, unlike a chord root, because `song_key` is free text
 * and a key that cannot be read is the one thing that stops a chord layer
 * being saved. Matching a prefix would read "Gee" as the key of G and store a
 * chart nobody could play; refusing it asks for four keystrokes instead.
 */
const KEY_TEXT = /^([A-Ga-g])([#b♯♭]?)\s*(?:m|min|minor|maj|major)?$/i
/** A chord's root in number notation: any accidentals, then a degree 1–7. */
const NUMBER_ROOT = /^([#b♯♭]*)([1-7])/

/** Semitones an accidental string moves a note: `bb` is −2, `#` is +1. */
function accidentalOffset(text: string): number {
  let offset = 0
  for (const ch of text) {
    if (ch === '#' || ch === '♯') offset += 1
    else if (ch === 'b' || ch === '♭') offset -= 1
  }
  return offset
}

/** The accidentals for an offset: −2 is `bb`, +1 is `#`, 0 is nothing. */
function accidentalText(offset: number): string {
  return offset === 0 ? '' : (offset > 0 ? '#' : 'b').repeat(Math.abs(offset))
}

/**
 * A pitch difference as the smallest signed number of semitones.
 *
 * Both conversions compare a note against a scale degree that may sit on the
 * far side of the octave — B against a C tonic is +11 one way and −1 the
 * other — and only the small answer is a spelling a musician would write.
 */
function interval(semitones: number): number {
  const wrapped = ((semitones % 12) + 12) % 12
  return wrapped > 6 ? wrapped - 12 : wrapped
}

/**
 * Read an arrangement's key.
 *
 * "G", "Gm", "G minor" and "g" all give the same answer: the mode changes
 * nothing here, because degrees are counted from the tonic either way. What is
 * not a key at all — "Gee", "capo 2", nothing — comes back null, and the
 * caller refuses to store chords against it.
 */
export function parseSongKey(key: string | null | undefined): SongKey | null {
  const match = KEY_TEXT.exec((key ?? '').trim())
  if (!match) return null
  const letter = LETTERS.indexOf(
    match[1].toUpperCase() as (typeof LETTERS)[number],
  )
  return { letter, pitch: NATURAL[letter] + accidentalOffset(match[2]) }
}

/** One chord token converted, or null when it is not a chord in that notation. */
function letterToNumber(token: string, key: SongKey): string | null {
  const match = CHORD_ROOT.exec(token)
  if (!match) return null
  const rest = token.slice(match[0].length)
  if (!SUFFIX.test(rest)) return null
  const letter = LETTERS.indexOf(match[1] as (typeof LETTERS)[number])
  const degree = (letter - key.letter + 7) % 7
  const written = NATURAL[letter] + accidentalOffset(match[2])
  const scale = key.pitch + MAJOR[degree]
  return `${accidentalText(interval(written - scale))}${degree + 1}${rest}`
}

function numberToLetter(token: string, key: SongKey): string | null {
  const match = NUMBER_ROOT.exec(token)
  if (!match) return null
  const rest = token.slice(match[0].length)
  if (!SUFFIX.test(rest)) return null
  const degree = Number(match[2]) - 1
  const letter = (key.letter + degree) % 7
  const scale = key.pitch + MAJOR[degree]
  const offset = interval(scale - NATURAL[letter]) + accidentalOffset(match[1])
  return `${LETTERS[letter]}${accidentalText(offset)}${rest}`
}

/**
 * Convert one bracketed chord, slash bass and all.
 *
 * A slash chord is two chords' worth of notation ("G/B", "1/3"), so each side
 * is converted on its own and the whole token is kept as typed unless both
 * sides convert — half a conversion would be worse than none.
 */
function convertChord(
  token: string,
  convert: (part: string, key: SongKey) => string | null,
  key: SongKey,
): string {
  // A run carries several chords in one token. Each is converted on its own
  // and the bars, beat slashes and spacing are kept exactly as typed — the
  // layout *is* the rhythm, so respacing it would lose the timing. A beat
  // slash converts to itself, so it needs no case of its own. Prose is left to
  // `convertOne`, which fails it whole: converting it piece by piece would
  // renumber the `1` of `[Verse 1]`.
  if (isChordRun(token)) {
    return token.replace(/[^|\s]+/g, (piece) => convertOne(piece, convert, key))
  }
  return convertOne(token, convert, key)
}

function convertOne(
  token: string,
  convert: (part: string, key: SongKey) => string | null,
  key: SongKey,
): string {
  const parts = token.split('/')
  if (parts.length > 2) return token
  const converted: string[] = []
  for (const part of parts) {
    const next = convert(part.trim(), key)
    if (next === null) return token
    converted.push(next)
  }
  return converted.join('/')
}

function convertLayer(
  text: string,
  convert: (part: string, key: SongKey) => string | null,
  key: SongKey | null,
): string {
  if (key === null || text === '') return text
  return text
    .split('\n')
    .map((line) =>
      splitChordLine(line)
        .map((segment) =>
          segment.chord
            ? `[${convertChord(segment.text, convert, key)}]`
            : segment.text,
        )
        .join(''),
    )
    .join('\n')
}

/**
 * "No chord" — the standard marking for a passage sung unaccompanied.
 *
 * It carries no pitch, so nothing converts it, but it belongs with the chords
 * rather than in the words: printed as a lyric it reads as something to sing.
 */
const NO_CHORD = /^n\.?c\.?$/i

/**
 * Several chords in one token: `C#m E B Amaj7`, `| F#m / / / | D / / / |`.
 *
 * How an instrumental section is written — the chords of a run, sometimes with
 * bar lines around each measure and `/` for the beats that hold the chord
 * before it. Charts use it for intros, interludes and outros, where there are
 * no words to hang a chord on, and a site that publishes in ChordPro brackets
 * the whole run at once rather than one chord at a time.
 *
 * Every piece having to be a chord or a beat slash is what keeps the test
 * conservative — the suffix whitelist fails ordinary words on their second
 * letter, so `[Verse 1]`, `[Capo 2]` and `[| repeat |]` all stay the notes to
 * the band that they are. At least one piece must be a chord, so a row of bare
 * beat slashes doesn't qualify on its own.
 */
function isChordRun(token: string): boolean {
  const pieces = token.split(/[|\s]+/).filter((piece) => piece !== '')
  return (
    pieces.some((piece) => piece !== '/') &&
    pieces.every(
      (piece) =>
        piece === '/' ||
        isChordIn(piece, CHORD_ROOT) ||
        isChordIn(piece, NUMBER_ROOT),
    )
  )
}

/**
 * Does this token parse as a chord, ignoring what key it is in?
 *
 * A structural test, not a conversion: it asks whether the text is *shaped*
 * like a chord, which is what a reader needs when deciding whether a row of
 * a pasted chart is chords or words. Both halves of a slash chord must pass,
 * matching `convertChord`.
 */
function isChordIn(token: string, root: RegExp): boolean {
  const parts = token.split('/')
  if (parts.length > 2) return false
  return parts.every((part) => {
    const text = part.trim()
    const match = root.exec(text)
    return match !== null && SUFFIX.test(text.slice(match[0].length))
  })
}

/** True for a chord written with a letter root: `G`, `Am7`, `D/F#`. */
export function isLetterChord(token: string): boolean {
  return isChordIn(token, CHORD_ROOT)
}

/**
 * True for anything that belongs in the chord layer rather than the words.
 *
 * A chord in either notation, a run of them with or without bar lines, or
 * `N.C.`. Everything else in brackets — `[Verse 1]`, `[x2]`, `[Capo 2]` — is
 * prose and stays where it was written.
 */
export function isChordToken(token: string): boolean {
  const text = token.trim()
  return (
    NO_CHORD.test(text) ||
    isChordRun(text) ||
    isChordIn(text, CHORD_ROOT) ||
    isChordIn(text, NUMBER_ROOT)
  )
}

/** A whole chord layer from letters to numbers. Unchanged without a key. */
export function chordsToNumbers(text: string, key: SongKey | null): string {
  return convertLayer(text, letterToNumber, key)
}

/** A whole chord layer from numbers to letters. Unchanged without a key. */
export function chordsToLetters(text: string, key: SongKey | null): string {
  return convertLayer(text, numberToLetter, key)
}

/** A chord layer in the notation asked for, from the stored numbers. */
export function chordsIn(
  text: string,
  notation: ChordNotation,
  key: SongKey | null,
): string {
  return notation === 'letters' ? chordsToLetters(text, key) : text
}

/**
 * True when a text holds at least one bracketed chord.
 *
 * This is the test for "this layer needs a key": an unbracketed line has
 * nothing to convert, so it neither gains nor loses by the key being there.
 */
export function hasChordTokens(text: string | null | undefined): boolean {
  return splitChordLine(text ?? '').some((segment) => segment.chord)
}
