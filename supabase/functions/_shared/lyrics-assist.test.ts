// The invariants the `lyrics-assist` function cannot get wrong: never lose a
// line of someone's lyrics, never write a label the app can't parse, and never
// hand back a tag that would split in two the moment it is stored.
//
//   deno test supabase/functions

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  alignLabels,
  alignTransliteration,
  normalizeTags,
  sectionsPrompt,
  tagsPrompt,
  transliterationPrompt,
} from './lyrics-assist.ts'

const NATIVE = ['Verse 1', 'ആ കരതാരിൽ', '', 'കാൽവറി നാഥാ']
const DRAFT = ['Verse 1', 'aa karathaaril', '', 'kaalvari natha']

Deno.test('alignTransliteration leaves headers and blank rows alone', () => {
  // A section header carries the song's structure, and a blank row carries its
  // stanza breaks — neither is sound to be romanised.
  assertEquals(
    alignTransliteration(['X', 'aa karathaaril mukham', 'Y', 'kaalvary naadha'], NATIVE, DRAFT),
    ['Verse 1', 'aa karathaaril mukham', '', 'kaalvary naadha'],
  )
})

Deno.test('alignTransliteration falls back to the draft, never to nothing', () => {
  // A model that returns too few entries, or a blank one, must not be able to
  // empty a line of someone's lyrics.
  assertEquals(alignTransliteration(['', ''], NATIVE, DRAFT), [
    'Verse 1',
    'aa karathaaril',
    '',
    'kaalvari natha',
  ])
})

Deno.test('alignTransliteration returns exactly the lines it was given', () => {
  const long = ['a', 'b', 'c', 'd', 'e', 'f']
  assertEquals(alignTransliteration(long, NATIVE, DRAFT).length, DRAFT.length)
})

Deno.test('transliterationPrompt shows the model both texts', () => {
  const prompt = transliterationPrompt('ml', NATIVE, DRAFT)
  assertStringIncludes(prompt, '2. ആ കരതാരിൽ')
  assertStringIncludes(prompt, 'draft: aa karathaaril')
  assertStringIncludes(prompt, 'ISO code "ml"')
  assertStringIncludes(prompt, '4 lines in, 4 entries out')
})

Deno.test('normalizeTags drops what the song already has', () => {
  assertEquals(normalizeTags(['grace', 'Cross'], [], ['cross']), ['grace'])
})

Deno.test('normalizeTags spells a tag the way the church already spells it', () => {
  // Otherwise "Christmas" and "christmas" both end up in the library and the
  // tag filter stops filtering.
  assertEquals(normalizeTags(['christmas'], ['Christmas', 'opener'], []), ['Christmas'])
})

Deno.test('normalizeTags strips the commas that would split a tag in two', () => {
  assertEquals(normalizeTags(['grace, mercy'], [], []), ['grace mercy'])
})

Deno.test('normalizeTags caps the list and drops sentences', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  assertEquals(normalizeTags(many, [], []).length, 6)
  assertEquals(normalizeTags(['a song about the goodness of God'], [], []), [])
})

Deno.test('normalizeTags never repeats itself', () => {
  assertEquals(normalizeTags(['Grace', 'grace', ' grace '], [], []), ['grace'])
})

Deno.test('alignLabels returns one label per paragraph', () => {
  assertEquals(alignLabels(['Verse 1'], 3), ['Verse 1', '', ''])
  assertEquals(alignLabels(['Verse 1', 'Chorus', 'Verse 2', 'Bridge'], 2), [
    'Verse 1',
    'Chorus',
  ])
})

Deno.test('alignLabels drops anything the section grammar cannot read', () => {
  // These strings are written into a person's lyrics as header lines, so a
  // label the app cannot parse is worse than no label at all.
  assertEquals(alignLabels(['Title', 'Verse one', 'Chorus:'], 3), ['', '', 'Chorus'])
})

Deno.test('alignLabels normalises to the app spelling', () => {
  assertEquals(alignLabels(['[verse2]', 'PRE-CHORUS'], 2), ['Verse 2', 'Pre-Chorus'])
})

Deno.test('sectionsPrompt numbers the paragraphs and states the count', () => {
  const prompt = sectionsPrompt([['one', 'two'], ['three']])
  assertStringIncludes(prompt, '2 paragraphs in')
  assertStringIncludes(prompt, '1.\none\ntwo')
  assertStringIncludes(prompt, '2.\nthree')
})

Deno.test('tagsPrompt offers the vocabulary the church already uses', () => {
  const prompt = tagsPrompt({
    title: 'Amazing Grace',
    lyrics: 'Amazing grace how sweet the sound',
    native: '',
    known: ['opener', 'communion'],
  })
  assertStringIncludes(prompt, 'opener, communion')
  assertStringIncludes(prompt, 'Title: Amazing Grace')
})

Deno.test('tagsPrompt leaves the vocabulary out when there is none', () => {
  const prompt = tagsPrompt({ title: 'X', lyrics: 'y', native: '', known: [] })
  assertEquals(prompt.includes('already uses'), false)
})
