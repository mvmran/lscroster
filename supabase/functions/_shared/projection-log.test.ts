// The projection API request log's pure helpers.
//
//   deno test supabase/functions

import { assertEquals } from 'jsr:@std/assert@1'
import {
  clip,
  FAILURE_RETENTION_DAYS,
  keyPrefixOf,
  pruneCutoffs,
  SUCCESS_RETENTION_DAYS,
} from './projection-log.ts'

Deno.test('keyPrefixOf keeps only the display prefix of a projection key', () => {
  assertEquals(keyPrefixOf(`lscp_${'a1b2c3d4'.repeat(8)}`), 'lscp_a1b2c3')
  // A key cut short, or mistyped past the prefix, still shows what it has.
  assertEquals(keyPrefixOf('lscp_a1b'), 'lscp_a1b')
  assertEquals(keyPrefixOf('lscp_a1b2c3XYZ'), 'lscp_a1b2c3')
  assertEquals(keyPrefixOf('lscp_'), 'lscp_')
})

Deno.test('keyPrefixOf keeps nothing of a credential that is not ours', () => {
  assertEquals(keyPrefixOf('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload'), null)
  assertEquals(keyPrefixOf('sb_secret_abc123'), null)
  assertEquals(keyPrefixOf('LSCP_A1B2C3'), null)
  assertEquals(keyPrefixOf(''), null)
})

Deno.test('clip trims, cuts, and turns blank into null', () => {
  assertEquals(clip('  curl/8.5.0  ', 300), 'curl/8.5.0')
  assertEquals(clip('x'.repeat(400), 300), 'x'.repeat(300))
  assertEquals(clip('   ', 300), null)
  assertEquals(clip(null, 300), null)
  assertEquals(clip(undefined, 300), null)
})

Deno.test('pruneCutoffs: failures go after 90 days, successes after a year', () => {
  assertEquals(FAILURE_RETENTION_DAYS, 90)
  assertEquals(SUCCESS_RETENTION_DAYS, 365)
  const { failures, successes } = pruneCutoffs(new Date('2026-10-26T00:00:00.000Z'))
  assertEquals(failures, '2026-07-28T00:00:00.000Z')
  assertEquals(successes, '2025-10-26T00:00:00.000Z')
})
