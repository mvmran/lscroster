// An admin's copy of a published plan they aren't on says so, and opens the
// plan rather than their schedule (0071).
import { assert, assertStringIncludes } from 'jsr:@std/assert@1'
import { planNotificationEmail, type PlanNotificationParams } from './plan-notification.ts'

const base: PlanNotificationParams = {
  churchName: 'Test Church',
  churchAddress: null,
  recipientName: 'Ava',
  planDateLong: 'Sunday 25 October 2026',
  serviceTypeName: 'Sunday 10am',
  planTitle: null,
  startTime: '10:00am',
  endTime: null,
  durationLabel: null,
  times: [],
  teams: [],
  order: [],
  songs: [],
  appUrl: 'https://app.example',
}

Deno.test('planNotificationEmail: someone serving gets their schedule', () => {
  const { html } = planNotificationEmail(base)
  assertStringIncludes(html, 'https://app.example/my-schedule')
  assertStringIncludes(html, 'View my schedule')
  assert(!html.includes("the admin's copy"))
})

Deno.test("planNotificationEmail: an admin's copy says so and opens the plan", () => {
  const { html } = planNotificationEmail({ ...base, adminCopyPlanId: 'plan-1' })
  assertStringIncludes(html, 'https://app.example/services/plans/plan-1')
  assertStringIncludes(html, 'View the plan')
  assertStringIncludes(html, "the admin's copy")
  assertStringIncludes(html, 'Published')
  assert(!html.includes('/my-schedule'))
})
