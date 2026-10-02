// The invariants the `suggest-song` function cannot get wrong: never return a
// song outside the candidate set, and never let a chatty or malformed reply
// through as a suggestion.
//
//   deno test supabase/functions

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  buildSuggestPrompt,
  parseSuggestion,
  summarizeUsage,
  type Candidate,
  type SuggestContext,
  type UsageRow,
} from './song-suggest.ts'

const candidate = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  title: `Song ${id}`,
  author: null,
  tags: [],
  keys: [],
  bpm: null,
  lastUsed: null,
  ...over,
})

const context = (over: Partial<SuggestContext> = {}): SuggestContext => ({
  serviceType: 'Sunday 10am',
  planDate: '2026-10-04',
  current: [{ title: 'Great Are You Lord', key: 'G', tags: ['English'], bpm: 72 }],
  candidates: [candidate('a'), candidate('b')],
  history: [],
  ...over,
})

Deno.test('prompt carries the chosen songs, candidates and the rules', () => {
  const prompt = buildSuggestPrompt(
    context({
      candidates: [candidate('a', { title: 'Way Maker', keys: ['E'], tags: ['English'] })],
      history: [{ date: '2026-09-27', serviceType: 'Sunday 10am', songs: ['Way Maker'] }],
    }),
  )
  assertStringIncludes(prompt, 'Great Are You Lord')
  assertStringIncludes(prompt, 'Way Maker')
  assertStringIncludes(prompt, 'Musical fit')
  assertStringIncludes(prompt, 'Language balance')
  // The candidate's id is what the model must echo back.
  assertStringIncludes(prompt, '"songId":"a"')
})

Deno.test('parseSuggestion accepts an id from the candidate set', () => {
  const result = parseSuggestion(
    { songId: 'b', reason: '  Flows from the last song  ', keyNote: 'works in G' },
    new Set(['a', 'b']),
  )
  assertEquals(result, {
    songId: 'b',
    reason: 'Flows from the last song',
    keyNote: 'works in G',
  })
})

Deno.test('parseSuggestion rejects an id not offered', () => {
  assertEquals(parseSuggestion({ songId: 'z' }, new Set(['a', 'b'])), null)
})

Deno.test('parseSuggestion rejects a missing or non-string id', () => {
  assertEquals(parseSuggestion({ reason: 'x' }, new Set(['a'])), null)
  assertEquals(parseSuggestion({ songId: 123 }, new Set(['a'])), null)
})

Deno.test('parseSuggestion tolerates a blank reason but keeps the id', () => {
  const result = parseSuggestion({ songId: 'a' }, new Set(['a']))
  assertEquals(result?.songId, 'a')
  assertEquals(result?.reason, '')
  assertEquals(result?.keyNote, '')
})

Deno.test('parseSuggestion caps a runaway reason', () => {
  const result = parseSuggestion(
    { songId: 'a', reason: 'x'.repeat(500), keyNote: 'y'.repeat(500) },
    new Set(['a']),
  )
  assertEquals(result!.reason.length <= 240, true)
  assertEquals(result!.keyNote.length <= 140, true)
})

const use = (songId: string, planId: string, date: string): UsageRow => ({
  songId,
  planId,
  date,
  serviceType: 'Sunday 10am',
})
const titles: Record<string, string> = { s1: 'One', s2: 'Two', s3: 'Three' }
const titleOf = (id: string): string | undefined => titles[id]

Deno.test('summarizeUsage leaves the plan being built out of the history', () => {
  const { history, lastUsed } = summarizeUsage(
    [use('s1', 'this', '2026-10-04'), use('s2', 'past', '2026-09-27')],
    { planId: 'this', planDate: '2026-10-04', maxPlans: 40 },
    titleOf,
  )
  assertEquals(history.map((h) => h.songs), [['Two']])
  assertEquals(lastUsed.has('s1'), false)
})

Deno.test('summarizeUsage: last used is the latest date before this service', () => {
  const { lastUsed } = summarizeUsage(
    [
      use('s1', 'a', '2026-08-30'),
      use('s1', 'b', '2026-09-20'),
      // Booked for a later service — not "just sung".
      use('s1', 'c', '2026-11-01'),
    ],
    { planId: 'this', planDate: '2026-10-04', maxPlans: 40 },
    titleOf,
  )
  assertEquals(lastUsed.get('s1'), '2026-09-20')
})

Deno.test('summarizeUsage: history is newest first, capped, unnamed songs dropped', () => {
  const { history } = summarizeUsage(
    [
      use('s1', 'old', '2026-09-06'),
      use('s2', 'new', '2026-09-27'),
      use('gone', 'new', '2026-09-27'),
      use('s3', 'mid', '2026-09-13'),
    ],
    { planId: 'this', planDate: '2026-10-04', maxPlans: 2 },
    titleOf,
  )
  assertEquals(
    history.map((h) => [h.date, h.songs]),
    [
      ['2026-09-27', ['Two']],
      ['2026-09-13', ['Three']],
    ],
  )
})
