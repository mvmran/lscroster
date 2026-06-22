// Cron-driven reminder emails, invoked hourly by pg_cron (see migration 0004).
// Secured by a shared secret header, not a JWT. Two jobs in one pass, both
// idempotent via nudged_at/reminded_at:
//   1. Nudge people who haven't answered a request after N days (new token).
//   2. Remind confirmed people N days before the service.
// Emails only go out during the 9am hour in the church's timezone, so the
// hourly schedule lands correctly across timezones and DST.

import { serviceClient } from '../_shared/auth.ts'
import { jsonResponse } from '../_shared/cors.ts'
import {
  fetchEmailPrefs,
  prefAllows,
  resolveRecipient,
  type EmailPrefKey,
} from '../_shared/email-prefs.ts'
import { logEmail } from '../_shared/email-log.ts'
import {
  schedulingReminderEmail,
  schedulingRequestEmail,
} from '../_shared/email-templates/scheduling.ts'
import { sendEmailBatch } from '../_shared/resend.ts'
import {
  addDaysISO,
  appUrl,
  formatPlanDateLong,
  formatStartTime,
  hourInTimezone,
  planTimesLine,
  randomToken,
  sha256Hex,
  todayInTimezone,
} from '../_shared/scheduling.ts'

const SEND_HOUR = 9

interface ReminderRow {
  id: string
  notified_at: string | null
  people: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    status: string
    managed_by_person_id: string | null
  }
  positions: { name: string }
  teams: { name: string }
  plans: {
    id: string
    date: string
    title: string | null
    start_time: string | null
    service_types: { name: string; default_start_time: string | null }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) {
    return jsonResponse({ error: 'CRON_SECRET is not configured' }, 503)
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  // { force: true } skips the send-hour gate — used for manual testing.
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }

  const admin = serviceClient()
  const { data: church } = await admin
    .from('church_settings')
    .select('name, email_from_name, timezone, request_nudge_days, reminder_days_before')
    .maybeSingle()
  if (!church) return jsonResponse({ ok: true, skipped: 'no church settings' })

  const timezone = church.timezone || 'Australia/Sydney'
  if (!body.force && hourInTimezone(timezone) !== SEND_HOUR) {
    return jsonResponse({ ok: true, skipped: 'outside send hour' })
  }

  const today = todayInTimezone(timezone)
  const fromName = church.email_from_name ?? church.name
  const nudgeCutoff = new Date(
    Date.now() - church.request_nudge_days * 24 * 60 * 60 * 1000,
  ).toISOString()

  const selectColumns = `id, notified_at,
    people(id, first_name, last_name, email, status, managed_by_person_id),
    positions(name), teams(name),
    plans!inner(id, date, title, start_time, service_types(name, default_start_time))`

  // Each pass prepares its emails (minting tokens / stamping idempotency
  // columns) first, then sends them in one Batch API call (issue #18). The DB
  // writes don't count against the Resend rate limit.
  interface OutboundReminder {
    to: string
    subject: string
    html: string
    personId: string
    planId: string
    template: string
  }

  // Resolves a row's recipient, honouring the person's email preference
  // (issue #87) and routing managed people to their manager (issue #89).
  async function recipientFor(row: ReminderRow, prefKey: EmailPrefKey) {
    const person = row.people
    if (person.status !== 'active') return null
    const prefs = await fetchEmailPrefs(admin, [person.id])
    if (!prefAllows(prefs, person.id, prefKey)) return null
    return resolveRecipient(admin, person)
  }

  // -- nudges: pending, emailed at least nudge_days ago, never nudged --------
  // request_nudge_days = 0 disables the nudge job entirely (issue #88).
  const nudgeOutbound: OutboundReminder[] = []
  if (church.request_nudge_days > 0) {
    const { data: nudgeRows } = await admin
      .from('plan_assignments')
      .select(selectColumns)
      .eq('status', 'pending')
      .not('notified_at', 'is', null)
      .lte('notified_at', nudgeCutoff)
      .is('nudged_at', null)
      .gte('plans.date', today)

    for (const row of (nudgeRows ?? []) as unknown as ReminderRow[]) {
      const recipient = await recipientFor(row, 'nudge_emails')
      if (!recipient) continue

      const token = randomToken()
      const { error } = await admin
        .from('plan_assignments')
        .update({
          token_hash: await sha256Hex(token),
          nudged_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) {
        console.error('Nudge token update failed:', error)
        continue
      }

      const { subject, html } = schedulingRequestEmail({
        churchName: church.name,
        recipientName: recipient.recipientName,
        onBehalfOf: recipient.onBehalfOf,
        planDateLong: formatPlanDateLong(row.plans.date),
        startTime: await planTimesLine(
          admin,
          row.plans.id,
          formatStartTime(row.plans.start_time ?? row.plans.service_types.default_start_time),
        ),
        serviceTypeName: row.plans.service_types.name,
        planTitle: row.plans.title,
        teamName: row.teams.name,
        positionName: row.positions.name,
        respondUrl: `${appUrl()}/respond/${token}`,
        isNudge: true,
      })
      nudgeOutbound.push({
        to: recipient.email,
        subject,
        html,
        personId: row.people.id,
        planId: row.plans.id,
        template: 'scheduling-nudge',
      })
    }
  }

  const nudgeResults = await sendEmailBatch(
    nudgeOutbound.map((o) => ({
      to: o.to,
      subject: o.subject,
      html: o.html,
      fromName,
    })),
  )
  await Promise.all(
    nudgeOutbound.map((o, idx) =>
      logEmail(admin, {
        to: o.to,
        template: o.template,
        subject: o.subject,
        result: nudgeResults[idx],
        personId: o.personId,
        planId: o.planId,
      }),
    ),
  )
  const nudged = nudgeResults.filter((r) => r.sent).length

  // -- reminders: confirmed, service within reminder_days_before -------------
  // reminder_days_before = 0 disables the reminder job entirely (issue #88).
  const reminderOutbound: OutboundReminder[] = []
  if (church.reminder_days_before > 0) {
    const { data: reminderRows } = await admin
      .from('plan_assignments')
      .select(selectColumns)
      .eq('status', 'confirmed')
      .is('reminded_at', null)
      .gte('plans.date', today)
      .lte('plans.date', addDaysISO(today, church.reminder_days_before))

    for (const row of (reminderRows ?? []) as unknown as ReminderRow[]) {
      const recipient = await recipientFor(row, 'reminder_emails')
      if (!recipient) continue

      const { error } = await admin
        .from('plan_assignments')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) {
        console.error('Reminder update failed:', error)
        continue
      }

      const { subject, html } = schedulingReminderEmail({
        churchName: church.name,
        recipientName: recipient.recipientName,
        onBehalfOf: recipient.onBehalfOf,
        planDateLong: formatPlanDateLong(row.plans.date),
        startTime: await planTimesLine(
          admin,
          row.plans.id,
          formatStartTime(row.plans.start_time ?? row.plans.service_types.default_start_time),
        ),
        serviceTypeName: row.plans.service_types.name,
        planTitle: row.plans.title,
        teamName: row.teams.name,
        positionName: row.positions.name,
        appUrl: appUrl(),
      })
      reminderOutbound.push({
        to: recipient.email,
        subject,
        html,
        personId: row.people.id,
        planId: row.plans.id,
        template: 'scheduling-reminder',
      })
    }
  }

  const reminderResults = await sendEmailBatch(
    reminderOutbound.map((o) => ({
      to: o.to,
      subject: o.subject,
      html: o.html,
      fromName,
    })),
  )
  await Promise.all(
    reminderOutbound.map((o, idx) =>
      logEmail(admin, {
        to: o.to,
        template: o.template,
        subject: o.subject,
        result: reminderResults[idx],
        personId: o.personId,
        planId: o.planId,
      }),
    ),
  )
  const reminded = reminderResults.filter((r) => r.sent).length

  return jsonResponse({ ok: true, nudged, reminded })
})
