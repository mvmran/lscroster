// Sends scheduling request emails for a plan's pending assignments (or a
// specific subset, for resends). Leader/admin only. Generates a fresh response
// token per email; only the hash is stored.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { logEmail } from '../_shared/email-log.ts'
import { schedulingRequestEmail } from '../_shared/email-templates/scheduling.ts'
import { sendEmailBatch } from '../_shared/resend.ts'
import {
  appUrl,
  formatPlanDateLong,
  formatStartTime,
  planTimesLine,
  randomToken,
  sha256Hex,
} from '../_shared/scheduling.ts'

const requestSchema = z.object({
  planId: z.uuid(),
  /** When set, resend to exactly these assignments (must be pending). */
  assignmentIds: z.array(z.uuid()).optional(),
})

interface AssignmentRow {
  id: string
  status: string
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = serviceClient()
  const caller = await getCallerPerson(req, admin)
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401)
  if (caller.role !== 'admin' && caller.role !== 'leader') {
    return jsonResponse({ error: 'Only leaders can send requests' }, 403)
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { planId, assignmentIds } = parsed.data

  const { data: plan } = await admin
    .from('plans')
    .select('id, date, title, start_time, service_types(name, default_start_time)')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404)

  let query = admin
    .from('plan_assignments')
    .select(
      'id, status, notified_at, people(id, first_name, last_name, email, status), positions(name), teams(name)',
    )
    .eq('plan_id', planId)
  // For an explicit "send email" on one person (issue #15) we don't restrict to
  // pending — a confirmed person can be re-sent the request so they can change
  // their answer. The bulk path still only sends to un-notified pending rows.
  query = assignmentIds
    ? query.in('id', assignmentIds)
    : query.eq('status', 'pending').is('notified_at', null)
  const { data: assignments, error: assignmentsError } = await query
  if (assignmentsError) {
    console.error('Assignment fetch failed:', assignmentsError)
    return jsonResponse({ error: 'Failed to load assignments' }, 500)
  }
  if (!assignments || assignments.length === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: [] })
  }

  const { data: church } = await admin
    .from('church_settings')
    .select('name, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCRoster'
  const fromName = church?.email_from_name ?? churchName

  const planDateLong = formatPlanDateLong(plan.date)
  const startTime = await planTimesLine(
    admin,
    planId,
    formatStartTime(plan.start_time ?? plan.service_types.default_start_time),
  )

  const skipped: { name: string; reason: string }[] = []

  // Prepare each email (minting + storing its response token) first, then send
  // them all in one Batch API call (issue #18). Token minting is a DB write, so
  // it doesn't count against the Resend rate limit.
  interface Outbound {
    name: string
    to: string
    subject: string
    html: string
    personId: string
  }
  const outbound: Outbound[] = []

  for (const assignment of assignments as unknown as AssignmentRow[]) {
    const person = assignment.people
    const fullName = `${person.first_name} ${person.last_name}`.trim()
    if (!person.email) {
      skipped.push({ name: fullName, reason: 'no email address' })
      continue
    }
    if (person.status !== 'active') {
      skipped.push({ name: fullName, reason: 'inactive' })
      continue
    }

    const token = randomToken()
    const { error: updateError } = await admin
      .from('plan_assignments')
      .update({
        token_hash: await sha256Hex(token),
        notified_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
    if (updateError) {
      console.error('Token update failed:', updateError)
      skipped.push({ name: fullName, reason: 'could not create token' })
      continue
    }

    const { subject, html } = schedulingRequestEmail({
      churchName,
      recipientName: person.first_name,
      planDateLong,
      startTime,
      serviceTypeName: plan.service_types.name,
      planTitle: plan.title,
      teamName: assignment.teams.name,
      positionName: assignment.positions.name,
      respondUrl: `${appUrl()}/respond/${token}`,
      isNudge: assignment.notified_at !== null,
    })
    outbound.push({
      name: fullName,
      to: person.email,
      subject,
      html,
      personId: person.id,
    })
  }

  const results = await sendEmailBatch(
    outbound.map((o) => ({
      to: o.to,
      subject: o.subject,
      html: o.html,
      fromName,
    })),
  )

  await Promise.all(
    outbound.map((o, idx) =>
      logEmail(admin, {
        to: o.to,
        template: 'scheduling-request',
        subject: o.subject,
        result: results[idx],
        personId: o.personId,
        planId,
      }),
    ),
  )

  let sent = 0
  outbound.forEach((o, idx) => {
    const result = results[idx]
    if (result.sent) {
      sent++
    } else {
      skipped.push({
        name: o.name,
        reason:
          result.reason === 'not_configured'
            ? 'email not configured'
            : 'email provider error',
      })
    }
  })

  return jsonResponse({ ok: true, sent, skipped })
})
