// Cron-driven reminder emails, invoked hourly by pg_cron (see migration 0004).
// Secured by a shared secret header, not a JWT. Two jobs in one pass, both
// idempotent via nudged_at/reminded_at:
//   1. Nudge people who haven't answered a request after N days (new token).
//   2. Remind confirmed people N days before the service.
// Emails only go out during the 9am hour in the church's timezone, so the
// hourly schedule lands correctly across timezones and DST.

import { serviceClient } from '../_shared/auth.ts'
import { jsonResponse } from '../_shared/cors.ts'
import { logEmail } from '../_shared/email-log.ts'
import {
  schedulingReminderEmail,
  schedulingRequestEmail,
} from '../_shared/email-templates/scheduling.ts'
import { sendEmail } from '../_shared/resend.ts'
import {
  addDaysISO,
  appUrl,
  formatPlanDateLong,
  formatStartTime,
  hourInTimezone,
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
  }
  positions: { name: string }
  teams: { name: string }
  plans: {
    id: string
    date: string
    title: string | null
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
    people(id, first_name, last_name, email, status),
    positions(name), teams(name),
    plans!inner(id, date, title, service_types(name, default_start_time))`

  // -- nudges: pending, emailed at least nudge_days ago, never nudged --------
  const { data: nudgeRows } = await admin
    .from('plan_assignments')
    .select(selectColumns)
    .eq('status', 'pending')
    .not('notified_at', 'is', null)
    .lte('notified_at', nudgeCutoff)
    .is('nudged_at', null)
    .gte('plans.date', today)

  let nudged = 0
  for (const row of (nudgeRows ?? []) as unknown as ReminderRow[]) {
    const person = row.people
    if (!person.email || person.status !== 'active') continue

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
      recipientName: person.first_name,
      planDateLong: formatPlanDateLong(row.plans.date),
      startTime: formatStartTime(row.plans.service_types.default_start_time),
      serviceTypeName: row.plans.service_types.name,
      planTitle: row.plans.title,
      teamName: row.teams.name,
      positionName: row.positions.name,
      respondUrl: `${appUrl()}/respond/${token}`,
      isNudge: true,
    })
    const result = await sendEmail({ to: person.email, subject, html, fromName })
    await logEmail(admin, {
      to: person.email,
      template: 'scheduling-nudge',
      subject,
      result,
      personId: person.id,
      planId: row.plans.id,
    })
    if (result.sent) nudged++
  }

  // -- reminders: confirmed, service within reminder_days_before -------------
  const { data: reminderRows } = await admin
    .from('plan_assignments')
    .select(selectColumns)
    .eq('status', 'confirmed')
    .is('reminded_at', null)
    .gte('plans.date', today)
    .lte('plans.date', addDaysISO(today, church.reminder_days_before))

  let reminded = 0
  for (const row of (reminderRows ?? []) as unknown as ReminderRow[]) {
    const person = row.people
    if (!person.email || person.status !== 'active') continue

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
      recipientName: person.first_name,
      planDateLong: formatPlanDateLong(row.plans.date),
      startTime: formatStartTime(row.plans.service_types.default_start_time),
      serviceTypeName: row.plans.service_types.name,
      planTitle: row.plans.title,
      teamName: row.teams.name,
      positionName: row.positions.name,
      appUrl: appUrl(),
    })
    const result = await sendEmail({ to: person.email, subject, html, fromName })
    await logEmail(admin, {
      to: person.email,
      template: 'scheduling-reminder',
      subject,
      result,
      personId: person.id,
      planId: row.plans.id,
    })
    if (result.sent) reminded++
  }

  return jsonResponse({ ok: true, nudged, reminded })
})
