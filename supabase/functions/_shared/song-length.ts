// How long a song will take in a service, for the plan's Length box (Gemini).
//
// The model does the one part that needs judgement: reading the song the way
// the band plays it — sections in the order they're sung, each line's chords —
// and counting the bars in each section. The arithmetic stays here, where it
// can't drift: bars × beats per bar × 60 / BPM, with the beats per bar read
// from the meter the way the app's metronome counts it, then the changeover
// added for moving between songs. (Asked for seconds outright, the model's
// number and its own working disagreed — 175 bars at 72 BPM is not 4:53.)
// Pure, so the Deno tests cover it without a model.

import { matchHeader } from './lyric-sections.ts'

/** Time to finish one song and start the next — counted into every song. */
export const SONG_CHANGE_SECONDS = 30

/**
 * The shortest and longest song length the model's answer may come to. The
 * floor only catches a broken answer: a song whose lyrics are a fragment (one
 * verse and a line of chorus) honestly times at under a minute, and the client
 * says why a short estimate is short.
 */
export const MIN_SONG_SECONDS = 10
export const MAX_SONG_SECONDS = 20 * 60

/** Most bars one section may have before the answer reads as nonsense. */
const MAX_SECTION_BARS = 96

/** The structured answer asked of the model: bars per section, in order. */
export const LENGTH_SCHEMA = {
  type: 'object',
  properties: {
    bars: { type: 'array', items: { type: 'integer' } },
    reasoning: { type: 'string' },
  },
  required: ['bars', 'reasoning'],
}

/**
 * Beats in a bar, as the BPM counts them — the metronome's reading of a
 * meter: 4/4 is 4, 3/4 is 3, and a compound meter (6/8, 9/8, 12/8) counts its
 * dotted beats, so 6/8 is 2. No meter, or one it can't read, is 4/4.
 */
export function beatsPerBar(meter: string | null): number {
  const match = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(meter ?? '')
  if (!match) return 4
  const beats = Number(match[1])
  const unit = Number(match[2])
  if (beats < 1 || ![1, 2, 4, 8, 16].includes(unit)) return 4
  return unit === 8 && beats > 3 && beats % 3 === 0 ? beats / 3 : beats
}

/** One section of the song as the band plays it. */
export interface PlayedSection {
  label: string | null
  /** Each line with its words (may be blank) and its chords (may be blank). */
  rows: Array<{ words: string; chords: string }>
}

/**
 * The song's sections in the order they're written — which is the order
 * they're sung — with each line's chords beside it. A line with chords but no
 * words is kept: an intro or outro written as chord bars is exactly the part
 * whose length can only be counted from its bars. Headers in the chord layer
 * (repeated there to keep the layers in step) are dropped.
 */
export function playedSections(lyrics: string, chords: string | null): PlayedSection[] {
  const words = lyrics.replace(/\r\n/g, '\n').split('\n')
  const chordRows = (chords ?? '').replace(/\r\n/g, '\n').split('\n')
  const sections: PlayedSection[] = []
  let current: PlayedSection | null = null
  words.forEach((line, i) => {
    const header = matchHeader(line)
    if (header) {
      current = { label: header.label, rows: [] }
      sections.push(current)
      return
    }
    const chordRow = (chordRows[i] ?? '').trim()
    const row = { words: line.trim(), chords: matchHeader(chordRow) ? '' : chordRow }
    if (row.words === '' && row.chords === '') return
    if (!current) {
      current = { label: null, rows: [] }
      sections.push(current)
    }
    current.rows.push(row)
  })
  return sections
}

export interface LengthInput {
  /** The song's title, or the medley's titles in order. */
  titles: string[]
  bpm: number
  /** Time signature, e.g. "4/4" or "6/8"; null when not known. */
  meter: string | null
  /** The song as written: its sections in the order they're sung. */
  sections: PlayedSection[]
}

/** One section as the prompt shows it: heading, then each line with its chords. */
function sectionText(section: PlayedSection): string {
  const lines = section.rows.map(({ words, chords }) => {
    if (words === '') return `  (instrumental) chords: ${chords}`
    return chords ? `  ${words}\n    chords: ${chords}` : `  ${words}`
  })
  const heading = section.label ?? 'Untitled section'
  return [`[${heading}]`, ...(lines.length ? lines : ['  (empty)'])].join('\n')
}

/** The question put to the model. */
export function lengthPrompt(input: LengthInput): string {
  const what =
    input.titles.length > 1
      ? `a medley of ${input.titles.map((t) => `"${t}"`).join(', ')}`
      : `the song "${input.titles[0] ?? 'Untitled'}"`
  return [
    `Estimate how long a church worship band takes to play ${what} once, start to`,
    'finish, exactly as written below.',
    '',
    `Tempo: ${input.bpm} BPM. Meter: ${input.meter ?? 'not given (assume 4/4)'}.`,
    '',
    'The song is written out in the order it is sung, section by section; a',
    'repeated section is written out again. Chords are numbered from the key',
    '(1 = the key chord). A line of chords with "/" marks holds each chord for a',
    'beat per "/", and "|" separates bars — count those bars for instrumental',
    'sections. For sung lines, judge the bars from the words and the chord',
    'changes: a typical line spans two or four bars.',
    '',
    'Count the bars in each section as a worship band plays it — include a held',
    'last chord or a short turnaround where the song would have one, but nothing',
    'for talking or for changing to the next song. The time is worked out from',
    'your bars, so count bars only, not seconds.',
    '',
    `Reply as JSON: "bars" — one integer per section, in the order the ${input.sections.length}`,
    'sections appear below; "reasoning" — one short sentence on how you counted.',
    '',
    'THE SONG',
    ...input.sections.map(sectionText),
  ].join('\n')
}

/**
 * The model's bar counts as the song's length in seconds — or null if they
 * aren't one sane count per section, or come to an unlikely length.
 */
export function songSeconds(
  value: Record<string, unknown>,
  sections: number,
  bpm: number,
  meter: string | null,
): { seconds: number; bars: number } | null {
  const bars = value.bars
  if (!Array.isArray(bars) || bars.length !== sections) return null
  if (!bars.every((b) => Number.isInteger(b) && b >= 0 && b <= MAX_SECTION_BARS)) return null
  const total = (bars as number[]).reduce((sum, b) => sum + b, 0)
  const seconds = Math.round((total * beatsPerBar(meter) * 60) / bpm)
  if (seconds < MIN_SONG_SECONDS || seconds > MAX_SONG_SECONDS) return null
  return { seconds, bars: total }
}

/**
 * The plan length for a song: its running time plus the changeover, rounded
 * up to the next quarter minute — a plan reads in round numbers.
 */
export function planLength(songSeconds: number): number {
  return Math.ceil((songSeconds + SONG_CHANGE_SECONDS) / 15) * 15
}
