// The digest names the teams its counts cover, after the intro.
import { assert, assertStringIncludes } from 'jsr:@std/assert@1'
import { rosterStatusEmail } from './roster-status.ts'

const params = {
  churchName: 'Test Church',
  recipientName: 'Ava',
  onBehalfOf: null,
  weeks: 4,
  rows: [
    {
      date: '2026-10-25',
      daysUntil: 1,
      unassigned: 1,
      unsent: 0,
      unconfirmed: 2,
      declined: 0,
      confirmed: 3,
    },
  ],
  appUrl: 'https://app.example',
}

Deno.test('rosterStatusEmail lists the teams after the intro', () => {
  const { html } = rosterStatusEmail({ ...params, teamNames: ['Worship', 'Sound & Media'] })
  assertStringIncludes(html, 'Counts cover the teams you oversee: Worship, Sound &amp; Media.')
})

Deno.test('rosterStatusEmail keeps the plain sentence with no names', () => {
  const { html } = rosterStatusEmail({ ...params, teamNames: [] })
  assertStringIncludes(html, 'Counts cover the teams you oversee.')
  assert(!html.includes('oversee:'))
})
