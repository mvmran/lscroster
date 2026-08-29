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
import { matchLyricSectionHeader } from '../../../src/features/services/lyric-sections.ts'
import { toApiSections } from './lyric-sections.ts'

/**
 * What the Deno port makes of a line on its own: the label of the section it
 * opens, or null when it isn't a header at all. `toApiSections` falls back to
 * unlabeled stanza sections, which is how a non-header shows up.
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
