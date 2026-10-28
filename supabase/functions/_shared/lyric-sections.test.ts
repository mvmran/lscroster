// Parity between the two section parsers.
//
// `_shared/lyric-sections.ts` is a hand-maintained Deno port of
// `src/features/services/lyric-sections.ts`, and its own header says to keep
// the keyword vocabulary and HEADER_RE in sync with that file. Nothing enforced
// that until this test: add a keyword to the app and forget the port, and the
// projection API quietly stops recognising that section for the church's
// projection software — with every test still green.
//
// Both files are dependency-free, so this loads the app's copy directly and
// runs the same corpus through both.
//
//   deno test supabase/functions

import { assertEquals } from 'jsr:@std/assert@1'
import {
  matchLyricSectionHeader,
  sameSection as appSameSection,
  sectionContent as appSectionContent,
  sectionKeyOf,
} from '../../../src/features/services/lyric-sections.ts'
import {
  apiSequence,
  matchHeader,
  sameSection,
  sectionContent,
  sectionsOnce,
  toApiSections,
  type ApiLyricSection,
} from './lyric-sections.ts'

/** The sequence the API sends for a written song, as the handler builds it. */
const seq = (written: ApiLyricSection[], sequence: string[] | null | undefined) =>
  apiSequence(written, sequence, sectionsOnce(written))
/** The sections the API sends for a written song. */
const sent = (written: ApiLyricSection[]) => sectionsOnce(written).sections

/**
 * What the Deno port makes of a line on its own: the label of the section it
 * opens, or null when it isn't a header at all. `toApiSections` falls back to
 * unlabelled stanza sections, which is how a non-header shows up.
 */
function portLabel(line: string): string | null {
  const [section] = toApiSections(`${line}\nsome lyric line`)
  return section?.label ?? null
}

/** Every keyword the app's grammar knows, plus the shapes around them. */
const KEYWORDS = [
  'verse', 'chorus', 'pre-chorus', 'prechorus', 'pre chorus', 'bridge', 'intro',
  'outro', 'tag', 'refrain', 'interlude', 'instrumental', 'ending', 'vamp',
  'turnaround', 'coda', 'hook', 'reprise', 'breakdown', 'channel', 'descant',
]

const CORPUS = [
  // Plain, numbered, lettered, bracketed, parenthesised, colonised, cased.
  ...KEYWORDS,
  ...KEYWORDS.map((k) => `${k} 1`),
  ...KEYWORDS.map((k) => `[${k} 2]`),
  ...KEYWORDS.map((k) => `(${k})`),
  ...KEYWORDS.map((k) => `${k}:`),
  ...KEYWORDS.map((k) => k.toUpperCase()),
  ...KEYWORDS.map((k) => `  ${k} A  `),
  // Not headers: lyric lines that merely start with, or contain, a keyword.
  'Chorusa', 'versed in the word', 'Verse one', 'the bridge is long',
  'Amazing grace, how sweet the sound', '', '   ', 'Verse 100', 'Tag, you are it',
]

Deno.test('the Deno port and the app agree on what a header is', () => {
  const disagreements: string[] = []
  for (const line of CORPUS) {
    const app = matchLyricSectionHeader(line)
    const port = portLabel(line)
    // The app returns a match object with a label; the port returns the label
    // it assigned. Both must see a header, and must name it identically.
    if ((app?.label ?? null) !== port) {
      disagreements.push(
        `${JSON.stringify(line)}: app=${JSON.stringify(app?.label ?? null)} port=${JSON.stringify(port)}`,
      )
    }
  }
  assertEquals(disagreements, [], `parsers disagree on ${disagreements.length} line(s)`)
})

Deno.test('the corpus actually exercises the grammar', () => {
  // Guards against the test above passing because both sides recognise nothing.
  const recognised = CORPUS.filter((line) => matchLyricSectionHeader(line) !== null)
  assertEquals(recognised.length > 100, true, 'expected the corpus to hit many headers')
})

Deno.test('the Deno port and the app agree on which section a heading names', () => {
  // `apiSequence` matches a sequence step to a section by this key, and the
  // Lyrics Sheet by `sectionKeyOf`; the API must keep what the sheet keeps.
  const disagreements = CORPUS.filter(
    (line) => (matchHeader(line)?.key ?? null) !== sectionKeyOf(line),
  )
  assertEquals(disagreements, [])
})

Deno.test('every section label reads back as itself', () => {
  // A sequence step is a section's label; one that didn't re-parse to the
  // same section would never be found.
  for (const line of CORPUS) {
    const label = portLabel(line)
    if (label === null) continue
    assertEquals(matchHeader(label)?.label, label, JSON.stringify(line))
  }
})

const SONG = [
  '[Intro]', 'G C G', '', '[Verse 1]', 'one', '', '[Chorus x2]', 'sing', '',
  '[Verse 2]', 'two', '', '[Bridge]', 'bridge line',
].join('\n')

Deno.test('apiSequence: the plan\'s sequence, as the sections\' own labels', () => {
  const sections = toApiSections(SONG)
  assertEquals(
    seq(sections, ['Verse', 'Chorus', 'Verse 2', 'Chorus']),
    ['Verse 1', 'Chorus ×2', 'Verse 2', 'Chorus ×2'],
  )
  // Every section is still there for the operator, the bridge included.
  assertEquals(sections.map((s) => s.label), [
    'Intro', 'Verse 1', 'Chorus ×2', 'Verse 2', 'Bridge',
  ])
})

Deno.test('apiSequence: a step naming no section is dropped', () => {
  assertEquals(
    seq(toApiSections(SONG), ['Verse 1', 'Tag', 'Ending', 'Bridge']),
    ['Verse 1', 'Bridge'],
  )
})

Deno.test('apiSequence: an exact label wins over the first of its key', () => {
  // A chorus written once plain and once with its repeat count: each step
  // keeps the count it was given.
  const sections = toApiSections(
    '[Chorus]\nsing\n\n[Verse 2]\ntwo\n\n[Chorus x2]\nsing again',
  )
  assertEquals(seq(sections, ['Chorus', 'Verse 2', 'Chorus ×2']), [
    'Chorus', 'Verse 2', 'Chorus ×2',
  ])
  // However the step was typed, it is compared as the grammar spells it.
  assertEquals(seq(sections, ['chorus X2']), ['Chorus ×2'])
  // A count no heading carries falls back to the first of the name.
  assertEquals(seq(sections, ['Chorus ×3']), ['Chorus'])
})

Deno.test('apiSequence: an out-of-date sequence gives the whole song', () => {
  // As the Lyrics Sheet prints it when the sequence names none of the
  // headings — not the song's saved sequence, which may leave the bridge out.
  const whole = ['Intro', 'Verse 1', 'Chorus ×2', 'Verse 2', 'Bridge']
  const sections = toApiSections(SONG)
  assertEquals(seq(sections, ['Refrain']), whole)
  assertEquals(seq(sections, []), whole)
  assertEquals(seq(sections, null), whole)
  assertEquals(seq(sections, undefined), whole)
})

Deno.test('apiSequence: unlabelled stanzas are never steps', () => {
  assertEquals(seq(toApiSections('one\n\ntwo'), ['Verse 1']), [])
  assertEquals(seq(toApiSections('before\n\n[Chorus]\nsing'), null), [
    'Chorus',
  ])
  assertEquals(seq([], ['Chorus']), [])
})

// --- rows with chords and no words -----------------------------------------------

const NO_LAYERS = { lyrics_native: null, lyrics_meaning: null }

Deno.test('a row with chords and no words keeps its chords', () => {
  // An intro written as bars: the lyric rows are blank, the chord rows aren't.
  const lyrics = '[Intro]\n\n\n[Verse 1]\nThere is a name'
  const chords = '[Intro]\n[6m]/ [5/7] /\n[1] / [2m] /\n[Verse 1]\n[6m]There is a [4]name'
  const [intro, verse] = toApiSections(lyrics, { ...NO_LAYERS, lyrics_chords: chords })
  assertEquals(intro.label, 'Intro')
  assertEquals(intro.lines, ['', ''])
  assertEquals(intro.layers?.chords, ['[6m]/ [5/7] /', '[1] / [2m] /'])
  assertEquals(verse.lines, ['There is a name'])
  assertEquals(verse.layers?.chords, ['[6m]There is a [4]name'])
})

Deno.test('a row blank in every layer is still dropped', () => {
  const [verse] = toApiSections('[Verse 1]\none\n\ntwo\n', {
    ...NO_LAYERS,
    lyrics_chords: '[Verse 1]\n[G]\n\n[C]\n',
  })
  assertEquals(verse.lines, ['one', 'two'])
  assertEquals(verse.layers?.chords, ['[G]', '[C]'])
})

Deno.test('without headings, a chords-only row does not split a stanza', () => {
  const sections = toApiSections('one\n\ntwo\n\nthree', {
    ...NO_LAYERS,
    lyrics_chords: '[G]\n[C] [D]\n[G]\n\n[Em]',
  })
  assertEquals(sections.map((s) => s.lines), [['one', '', 'two'], ['three']])
})

// --- each section once -----------------------------------------------------------

const labels = (sections: { label: string | null }[]) => sections.map((s) => s.label)

Deno.test('sectionsOnce sends a chorus written out again only once', () => {
  const written = toApiSections(
    '[Chorus]\nBless the Lord\n\n[Verse 1]\nThe sun comes up\n\n[Chorus]\nBless the Lord!\n\n' +
      '[Verse 2]\nYou are rich\n\n[Chorus]',
  )
  // The second copy differs only in punctuation; the third is a bare cue.
  assertEquals(labels(written), ['Chorus', 'Verse 1', 'Chorus', 'Verse 2', 'Chorus'])
  assertEquals(labels(sent(written)), ['Chorus', 'Verse 1', 'Verse 2'])
})

Deno.test('sectionsOnce keeps what differs, and reads chords as the sheet does', () => {
  const withChords = (lyrics: string, chords: string) =>
    sent(toApiSections(lyrics, { ...NO_LAYERS, lyrics_chords: chords }))
  const song = '[Chorus]\nsing\n\n[Chorus]\nsing'
  // Chords on one copy only: the same chorus, charted once.
  assertEquals(labels(withChords(song, '[Chorus]\n[G]sing\n\n[Chorus]\nsing')), ['Chorus'])
  // Different chords on both: two choruses.
  assertEquals(labels(withChords(song, '[Chorus]\n[G]sing\n\n[Chorus]\n[D]sing')), [
    'Chorus', 'Chorus',
  ])
  // Different words under one heading stay too; "Verse" and "Verse 1" are one.
  const mixed = '[Verse]\none\n\n[Verse 1]\none\n\n[Chorus]\na\n\n[Chorus]\nb'
  assertEquals(labels(sent(toApiSections(mixed))), ['Verse', 'Chorus', 'Chorus'])
  // Unlabelled stanzas are never dropped.
  assertEquals(sent(toApiSections('same\n\nsame')).length, 2)
})

Deno.test('apiSequence keeps the repeats but names only sections sent', () => {
  const written = toApiSections(
    '[Chorus]\nsing\n\n[Verse 1]\none\n\n[Chorus x2]\nsing\n\n[Verse 2]\ntwo',
  )
  // "Chorus ×2" repeats "Chorus" and isn't sent; the sequence names the one that is.
  assertEquals(labels(sent(written)), ['Chorus', 'Verse 1', 'Verse 2'])
  assertEquals(seq(written, null), ['Chorus', 'Verse 1', 'Chorus', 'Verse 2'])
  assertEquals(seq(written, ['Chorus ×2', 'Verse 2']), ['Chorus', 'Verse 2'])
})

Deno.test('sectionsOnce: a repeat charted where the first was not lends its chords', () => {
  const written = toApiSections('[Chorus]\nBless the Lord\n\n[Verse 1]\none\n\n[Chorus]\nBless the Lord', {
    ...NO_LAYERS,
    lyrics_chords: '[Chorus]\n\n\n[Verse 1]\n[1]one\n\n[Chorus]\n[4]Bless the [1]Lord',
  })
  const [chorus, verse] = sent(written)
  // Sent once, in the first one's place, with the chords the second carried.
  assertEquals([chorus.label, verse.label], ['Chorus', 'Verse 1'])
  assertEquals(chorus.layers?.chords, ['[4]Bless the [1]Lord'])
  assertEquals(sent(written).length, 2)
})

Deno.test('sectionsOnce: after lending, later copies match the chorus as written', () => {
  // Bare, then [1][4], then [6m][5]: the sheet compares each with the bare one
  // it showed, so it shows one chorus — and so must the API, not a second
  // "Chorus" for the third copy.
  const written = toApiSections('[Chorus]\nsing\n\n[Chorus]\nsing\n\n[Chorus]\nsing', {
    ...NO_LAYERS,
    lyrics_chords: '[Chorus]\n\n\n[Chorus]\n[1]si[4]ng\n\n[Chorus]\n[6m]si[5]ng',
  })
  const once = sectionsOnce(written)
  assertEquals(labels(once.sections), ['Chorus'])
  assertEquals(once.sections[0].layers?.chords, ['[1]si[4]ng'])
  assertEquals(once.sentLabels, ['Chorus', 'Chorus', 'Chorus'])
})

Deno.test('sectionsOnce: lent chords keep a translation only the first copy has', () => {
  const song = '[Chorus]\nsthuthi\n\n[Verse 1]\none\n\n[Chorus]\nsthuthi'
  const layers = {
    lyrics_native: '[Chorus]\nസ്തുതി\n\n\n\n\n',
    lyrics_meaning: '[Chorus]\npraise\n\n\n\n\n',
    lyrics_chords: '[Chorus]\n\n\n[Verse 1]\n\n\n[Chorus]\n[1]sthuthi',
  }
  const [chorus] = sent(toApiSections(song, layers))
  assertEquals(chorus.lines, ['sthuthi'])
  assertEquals(chorus.layers?.chords, ['[1]sthuthi'])
  assertEquals(chorus.layers?.native, ['സ്തുതി'])
  assertEquals(chorus.layers?.meaning, ['praise'])
  // Rows that don't pair up (a chord-only intro row on the repeat): the chorus
  // keeps its translation and goes without the chords.
  const unpaired = sent(
    toApiSections(`${song.slice(0, -'sthuthi'.length)}\nsthuthi`, {
      ...layers,
      lyrics_chords: '[Chorus]\n\n\n[Verse 1]\n\n\n[Chorus]\n[1] [4]\n[1]sthuthi',
    }),
  )[0]
  assertEquals(unpaired.lines, ['sthuthi'])
  assertEquals(unpaired.layers?.native, ['സ്തുതി'])
  assertEquals(unpaired.layers?.meaning, ['praise'])
  assertEquals(unpaired.layers?.chords, undefined)
})

Deno.test('sectionsOnce: a cue gives way to the section written out later', () => {
  // A bare "Chorus" up front, the chorus itself further down: the lookup by
  // name must find the words, not an empty slide.
  const written = toApiSections('[Chorus]\n\n[Verse 1]\none\n\n[Chorus]\nsing\n\n[Chorus]')
  assertEquals(sent(written).map((s) => [s.label, s.lines]), [
    ['Verse 1', ['one']],
    ['Chorus', ['sing']],
  ])
  assertEquals(seq(written, null), ['Chorus', 'Verse 1', 'Chorus', 'Chorus'])
  // A heading never written out anywhere is still sent, once, so the step has
  // something to name.
  const cues = toApiSections('[Verse 1]\none\n\n[Tag]\n\n[Tag]')
  assertEquals(labels(sent(cues)), ['Verse 1', 'Tag'])
  assertEquals(seq(cues, null), ['Verse 1', 'Tag', 'Tag'])
})

Deno.test('apiSequence names a dropped step by the section it repeats', () => {
  // "Chorus" and "Chorus 1" share a key but not words, so both are sent; the
  // "Chorus x2" repeats "Chorus 1" — not the first chorus of the key.
  const written = toApiSections('[Chorus]\na\n\n[Chorus 1]\nb\n\n[Chorus x2]\nb')
  assertEquals(labels(sent(written)), ['Chorus', 'Chorus 1'])
  assertEquals(seq(written, ['Chorus ×2']), ['Chorus 1'])
  assertEquals(seq(written, null), ['Chorus', 'Chorus 1', 'Chorus 1'])
})

Deno.test('the repeat rule agrees with the app on what is the same section', () => {
  const bodies: Array<[string, string]> = [
    ['Bless the Lord, O my soul', ''],
    ['bless the lord o my soul!', ''],
    ['Bless the Lord, O my soul', '[4]Bless the Lord, O my [1]soul'],
    ['[4]Bless the Lord, O my [1]soul', ''],
    ['[5]Bless the Lord, O my [1]soul', ''],
    ['Bless the Lord', ''],
    ['', '[6m]/ [5/7] / | [1] /'],
    ['', ''],
    ['There is a name\nI love to hear', '[6m]There is a [4]name\nI [1]love to hear'],
  ]
  for (const [body, chords] of bodies) {
    assertEquals(sectionContent(body, chords), appSectionContent(body, chords))
  }
  const contents = bodies.map(([body, chords]) => appSectionContent(body, chords))
  for (const a of contents) {
    for (const b of contents) assertEquals(sameSection(a, b), appSameSection(a, b))
  }
})
