// The two invariants the `generate-meaning` function cannot get wrong:
// read the model's answer and nothing else, and return exactly one line of
// meaning per line of native text.
//
//   deno test supabase/functions

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { alignToLines, buildPrompt, extractText } from './meaning.ts'

const GLOSS = '["","Into those hands","","O Lord of Calvary"]'
const LINES = ['Verse 1', 'ആ കരതാരിൽ', '', 'കാൽവറി നാഥാ']

Deno.test('extractText reads the model output', () => {
  assertEquals(
    extractText({
      id: 'int_1',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: GLOSS }] }],
    }),
    GLOSS,
  )
})

Deno.test('extractText ignores the echoed prompt', () => {
  // A response can carry the user_input step alongside the model output.
  // Taking every text block in the payload prepends the whole prompt to the
  // answer, and the JSON parse then fails on every single call.
  assertEquals(
    extractText({
      id: 'int_1',
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'THE PROMPT' }] },
        { type: 'model_output', content: [{ type: 'text', text: GLOSS }] },
      ],
    }),
    GLOSS,
  )
})

Deno.test('extractText accepts the older shapes', () => {
  // `outputs` was renamed `steps` in May 2026; `output_text` is the SDK helper.
  assertEquals(
    extractText({ outputs: [{ type: 'model_output', content: [{ type: 'text', text: GLOSS }] }] }),
    GLOSS,
  )
  assertEquals(extractText({ output_text: GLOSS }), GLOSS)
})

Deno.test('extractText yields nothing for an unrecognised shape', () => {
  // Better an empty string — which the caller turns into a logged 502 — than a
  // plausible gloss assembled out of whatever text happened to be in the body.
  assertEquals(extractText({ candidates: [{ parts: [{ text: GLOSS }] }] }), '')
  assertEquals(extractText(null), '')
  assertEquals(extractText('nonsense'), '')
})

Deno.test('alignToLines returns one entry per line, whatever the model said', () => {
  assertEquals(alignToLines(JSON.parse(GLOSS), LINES), [
    '',
    'Into those hands',
    '',
    'O Lord of Calvary',
  ])
  // Too few, too many: the layers are line-parallel, so a miscount would shift
  // a song's meaning permanently against its lyrics.
  assertEquals(alignToLines(['a'], LINES), ['a', '', '', ''])
  assertEquals(alignToLines(['a', 'b', 'c', 'd', 'e', 'f'], LINES), ['a', 'b', '', 'd'])
  assertEquals(alignToLines([], LINES).length, LINES.length)
})

Deno.test('alignToLines keeps blank source lines blank', () => {
  // Line 3 is blank in LINES, so nothing may be written beside it.
  assertEquals(alignToLines(['w', 'x', 'INVENTED', 'z'], LINES), ['w', 'x', '', 'z'])
})

Deno.test('buildPrompt states the line count and names the language', () => {
  const text = buildPrompt('ml', LINES)
  assertStringIncludes(text, '4 lines in, 4 entries out')
  assertStringIncludes(text, 'ISO code "ml"')
  assertStringIncludes(text, '2. ആ കരതാരിൽ')
  // Without a language code the sentence is simply left out, not left dangling.
  assertEquals(buildPrompt(null, LINES).includes('ISO code'), false)
})
