// The set-list email links the one recording a plan picked (0053), falling
// back to the arrangement's first, and only ever as an http(s) href.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { chosenReferenceUrl, setlistEmail } from './setlist.ts'

const urls = ['https://youtu.be/studio', 'https://youtu.be/live']

Deno.test('chosenReferenceUrl keeps a pick the arrangement still lists', () => {
  assertEquals(chosenReferenceUrl('https://youtu.be/live', urls), 'https://youtu.be/live')
})

Deno.test('chosenReferenceUrl falls back to the first, or null', () => {
  assertEquals(chosenReferenceUrl(null, urls), 'https://youtu.be/studio')
  assertEquals(chosenReferenceUrl('https://youtu.be/gone', urls), 'https://youtu.be/studio')
  assertEquals(chosenReferenceUrl('https://youtu.be/live', []), null)
  assertEquals(chosenReferenceUrl(null, ['javascript:alert(1)']), null)
})

Deno.test('setlistEmail links one Listen per song, http(s) only', () => {
  const song = (title: string, referenceUrl: string | null) =>
    ({ title, detail: null, referenceUrl, key: 'G', meter: '4/4', bpm: 72 })
  const { html } = setlistEmail({
    churchName: 'Test Church',
    planDate: 'Sunday 19 October 2026',
    planTitle: null,
    serving: [],
    times: [],
    songs: [song('Picked', 'https://youtu.be/live'), song('Unsafe', 'javascript:alert(1)')],
    notes: null,
    planId: 'p',
    appUrl: 'https://example.org',
  } as unknown as Parameters<typeof setlistEmail>[0])
  assertStringIncludes(html, '<a href="https://youtu.be/live"')
  assertEquals(html.match(/>Listen&nbsp;›</g)?.length, 1)
  assertEquals(html.includes('javascript:'), false)
})
