import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  beatsPerBar,
  lengthPrompt,
  planLength,
  playedSections,
  SONG_CHANGE_SECONDS,
  songSeconds,
} from './song-length.ts'

const LYRICS = 'INTRO\n\n\nVerse 1\nThere is One on the throne\nHe is worthy\n\nChorus\nWorthy is the Lamb'
const CHORDS = 'INTRO\n[6m] / / / | [4] / / /\n\nVerse 1\n[6m]There is [4]One on the throne\n[1]He is worthy\n\nChorus\n[5]Worthy is the Lamb'

Deno.test('the prompt carries tempo, meter, the sections in order and their chords', () => {
  const prompt = lengthPrompt({
    titles: ['No One Like The Lord'],
    bpm: 72,
    meter: '4/4',
    sections: playedSections(LYRICS, CHORDS),
  })
  assert(prompt.includes('"No One Like The Lord"'))
  assert(prompt.includes('Tempo: 72 BPM. Meter: 4/4.'))
  assert(prompt.indexOf('[Verse 1]') < prompt.indexOf('[Chorus]'))
  assert(prompt.includes('chords: [6m]There is [4]One on the throne'))
  assert(prompt.includes('nothing\nfor talking or for changing'))
  assert(prompt.includes('one integer per section, in the order the 3'))
  // The intro's bars reach the model even though it has no words.
  assert(prompt.includes('[Intro]\n  (instrumental) chords: [6m] / / / | [4] / / /'))
})

Deno.test('sections keep chord-only lines and drop the chord layer\'s headers', () => {
  const sections = playedSections(LYRICS, CHORDS)
  assertEquals(sections.map((s) => s.label), ['Intro', 'Verse 1', 'Chorus'])
  assertEquals(sections[0].rows, [{ words: '', chords: '[6m] / / / | [4] / / /' }])
  assertEquals(sections[1].rows[1], { words: 'He is worthy', chords: '[1]He is worthy' })
  assertEquals(playedSections('Just words\nno headings', null), [
    { label: null, rows: [{ words: 'Just words', chords: '' }, { words: 'no headings', chords: '' }] },
  ])
})

Deno.test('a medley names every song, and a missing meter is said so', () => {
  const prompt = lengthPrompt({ titles: ['A', 'B'], bpm: 120, meter: null, sections: [] })
  assert(prompt.includes('a medley of "A", "B"'))
  assert(prompt.includes('not given (assume 4/4)'))
})

Deno.test('beats per bar follow the metronome: compound meters count dotted beats', () => {
  assertEquals(beatsPerBar('4/4'), 4)
  assertEquals(beatsPerBar('3/4'), 3)
  assertEquals(beatsPerBar('6/8'), 2)
  assertEquals(beatsPerBar('12/8'), 4)
  assertEquals(beatsPerBar(null), 4)
  assertEquals(beatsPerBar('free'), 4)
})

Deno.test('a fragment of a song times as what is written', () => {
  // One verse and a line of chorus, in 3/4 at 72: 20 bars, 50 s — honest, not refused.
  assertEquals(songSeconds({ bars: [16, 4] }, 2, 72, '3/4'), { seconds: 50, bars: 20 })
})

Deno.test('the seconds come from the bars, not from the model', () => {
  // 88 bars of 4/4 at 72 BPM: 352 beats × 60 / 72 = 293 s (4:53).
  assertEquals(songSeconds({ bars: [8, 40, 40] }, 3, 72, '4/4'), { seconds: 293, bars: 88 })
  // The same bars in 6/8 at a dotted-beat 60: 88 × 2 × 1 s.
  assertEquals(songSeconds({ bars: [8, 40, 40] }, 3, 60, '6/8'), { seconds: 176, bars: 88 })
})

Deno.test('a count that doesn\'t fit the song is refused', () => {
  assertEquals(songSeconds({ bars: [8, 40] }, 3, 72, '4/4'), null) // a section missing
  assertEquals(songSeconds({ bars: [8, 40, 4.5] }, 3, 72, '4/4'), null) // not whole
  assertEquals(songSeconds({ bars: [8, 40, -1] }, 3, 72, '4/4'), null)
  assertEquals(songSeconds({ bars: [8, 400, 8] }, 3, 72, '4/4'), null) // one absurd section
  assertEquals(songSeconds({ bars: [0, 0, 1] }, 3, 72, '4/4'), null) // 3 s: no song at all
  assertEquals(songSeconds({ seconds: 245 }, 3, 72, '4/4'), null)
})

Deno.test('the plan length adds the changeover and rounds up to a quarter minute', () => {
  assertEquals(SONG_CHANGE_SECONDS, 30)
  assertEquals(planLength(240), 270) // 4:00 + 0:30 = 4:30 exactly
  assertEquals(planLength(241), 285) // 4:31 → 4:45
  assertEquals(planLength(222), 255) // 4:12 → 4:15
})
