// A failed preferences read must switch emails off, not on: treating it as "no
// rows" (all on) would email everyone who opted out.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchEmailPrefs, prefAllows } from './email-prefs.ts'

/** A client whose one query answers `result`. */
function clientAnswering(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ in: () => Promise.resolve(result) }) }),
  } as unknown as SupabaseClient
}

Deno.test('fetchEmailPrefs: an unreadable table answers every flag off', async () => {
  const prefs = await fetchEmailPrefs(
    clientAnswering({ data: null, error: { message: 'column does not exist' } }),
    ['p-1'],
  )
  assertEquals(prefs.unreadable, true)
  assert(!prefAllows(prefs, 'p-1', 'publish_emails'))
  assert(!prefAllows(prefs, 'p-1', 'setlist_emails'))
})

Deno.test('fetchEmailPrefs: no row still means every flag on', async () => {
  const prefs = await fetchEmailPrefs(clientAnswering({ data: [], error: null }), ['p-1'])
  assertEquals(prefs.unreadable, undefined)
  assert(prefAllows(prefs, 'p-1', 'publish_emails'))
})
