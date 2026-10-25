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
  sectionKeyOf,
} from '../../../src/features/services/lyric-sections.ts'
import { apiSequence, matchHeader, toApiSections } from './lyric-sections.ts'

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
    apiSequence(sections, ['Verse', 'Chorus', 'Verse 2', 'Chorus']),
    ['Verse 1', 'Chorus ×2', 'Verse 2', 'Chorus ×2'],
  )
  // Every section is still there for the operator, the bridge included.
  assertEquals(sections.map((s) => s.label), [
    'Intro', 'Verse 1', 'Chorus ×2', 'Verse 2', 'Bridge',
  ])
})

Deno.test('apiSequence: a step naming no section is dropped', () => {
  assertEquals(
    apiSequence(toApiSections(SONG), ['Verse 1', 'Tag', 'Ending', 'Bridge']),
    ['Verse 1', 'Bridge'],
  )
})

Deno.test('apiSequence: an exact label wins over the first of its key', () => {
  // A chorus written once plain and once with its repeat count: each step
  // keeps the count it was given.
  const sections = toApiSections(
    '[Chorus]\nsing\n\n[Verse 2]\ntwo\n\n[Chorus x2]\nsing again',
  )
  assertEquals(apiSequence(sections, ['Chorus', 'Verse 2', 'Chorus ×2']), [
    'Chorus', 'Verse 2', 'Chorus ×2',
  ])
  // However the step was typed, it is compared as the grammar spells it.
  assertEquals(apiSequence(sections, ['chorus X2']), ['Chorus ×2'])
  // A count no heading carries falls back to the first of the name.
  assertEquals(apiSequence(sections, ['Chorus ×3']), ['Chorus'])
})

Deno.test('apiSequence: an out-of-date sequence gives the whole song', () => {
  // As the Lyrics Sheet prints it when the sequence names none of the
  // headings — not the song's saved sequence, which may leave the bridge out.
  const whole = ['Intro', 'Verse 1', 'Chorus ×2', 'Verse 2', 'Bridge']
  const sections = toApiSections(SONG)
  assertEquals(apiSequence(sections, ['Refrain']), whole)
  assertEquals(apiSequence(sections, []), whole)
  assertEquals(apiSequence(sections, null), whole)
  assertEquals(apiSequence(sections, undefined), whole)
})

Deno.test('apiSequence: unlabelled stanzas are never steps', () => {
  assertEquals(apiSequence(toApiSections('one\n\ntwo'), ['Verse 1']), [])
  assertEquals(apiSequence(toApiSections('before\n\n[Chorus]\nsing'), null), [
    'Chorus',
  ])
  assertEquals(apiSequence([], ['Chorus']), [])
})
