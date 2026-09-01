/**
 * Chords in letter and number notation — the Edge Function copy.
 *
 * A deliberate duplicate of `src/features/services/chord-notation.ts`, the way
 * `lyric-sections.ts` is duplicated: `supabase/functions` is a standalone Deno
 * tree outside the app's tsconfig, so it cannot import from `src/`. The two
 * must agree, and the tests beside this file are what says they still do.
 *
 * The app writes chords as numbers; this reads them back. Only the direction
 * the projection API needs is ported — the function never writes a chord.
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

/** A `[…]` chord token: no nested bracket, no newline, never empty. */
const CHORD_TOKEN = /\[([^\][\n]+)\]/g

/** One run of a chord line: either a bracketed chord, or the text around it. */
interface ChordSegment {
  chord: boolean
  text: string
}

/**
 * Split a chord line into its bracketed chords and the text between them.
 * Mirrors `splitChordLine` in the app, which is where the format is documented:
 * a bare chord row (`[1] [4]`) or a full ChordPro line (`[1]Amazing [4]grace`).
 */
function splitChordLine(line: string): ChordSegment[] {
  const segments: ChordSegment[] = []
  let cursor = 0
  for (const match of line.matchAll(CHORD_TOKEN)) {
    const start = match.index ?? cursor
    if (start > cursor) segments.push({ chord: false, text: line.slice(cursor, start) })
    segments.push({ chord: true, text: match[1] })
    cursor = start + match[0].length
  }
  if (cursor < line.length) segments.push({ chord: false, text: line.slice(cursor) })
  return segments
}

/** Which notation a chord layer is being read in. */
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

/** Does this token parse as a chord with the given root? The app's helper. */
function isChordIn(token: string, root: RegExp): boolean {
  const parts = token.split('/')
  if (parts.length > 2) return false
  return parts.every((part) => {
    const text = part.trim()
    const match = root.exec(text)
    return match !== null && SUFFIX.test(text.slice(match[0].length))
  })
}

/**
 * Several chords in one token: `6m 1 5 4maj7`, `| 6m / / / | 4 / / / |`.
 *
 * An instrumental section is written as a run — the chords with no words to
 * hang them on, sometimes with bar lines around each measure and `/` for the
 * beats that hold the chord before it. The app stores it exactly as it was
 * imported, so this file has to read it back.
 *
 * Every piece having to be a chord or a beat slash is what keeps the test
 * conservative, so `[Verse 1]` and `[| repeat |]` stay prose.
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
  // layout is the rhythm. A beat slash converts to itself, so it needs no case
  // here. Prose is left to `convertOne`, which fails it whole: converting it
  // piece by piece would turn the `1` of `[Verse 1]` into a chord letter.
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

/** A whole chord layer from letters to numbers. Unchanged without a key. */
export function chordsToNumbers(text: string, key: SongKey | null): string {
  return convertLayer(text, letterToNumber, key)
}

/** A whole chord layer from numbers to letters. Unchanged without a key. */
export function chordsToLetters(text: string, key: SongKey | null): string {
  return convertLayer(text, numberToLetter, key)
}
