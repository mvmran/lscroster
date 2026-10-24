// The footer's "Update email preferences" line: only when the email has a
// preference to point at, linking to the person's page.
import { assert, assertStringIncludes } from 'jsr:@std/assert@1'
import { footer } from './layout.ts'
import { schedulingReminderEmail } from './scheduling.ts'

Deno.test('footer adds the preferences link when given one', () => {
  const html = footer('Test Church', 'https://app.example/people/p-1')
  assertStringIncludes(html, 'Sent by LSCroster on behalf of Test Church.')
  assertStringIncludes(html, 'Update email preferences <a href="https://app.example/people/p-1"')
  assertStringIncludes(html, '>here</a>.')
})

Deno.test('footer has no preferences line without a link', () => {
  for (const html of [footer('Test Church'), footer('Test Church', null)]) {
    assertStringIncludes(html, 'Sent by LSCroster on behalf of Test Church.')
    assert(!html.includes('Update email preferences'))
  }
})

Deno.test('a scheduling email carries the link it is given', () => {
  const { html } = schedulingReminderEmail({
    churchName: 'Test Church',
    recipientName: 'Grace',
    planDateLong: 'Sunday 25 October 2026',
    startTime: '10:00am',
    serviceTypeName: 'Sunday 10am',
    planTitle: null,
    teamName: 'Worship',
    positionName: 'Vocals',
    appUrl: 'https://app.example',
    prefsUrl: 'https://app.example/people/p-2',
  })
  assertStringIncludes(html, 'href="https://app.example/people/p-2"')
})
