// Removes a plan assignment and, when the person had already confirmed, emails
// them a cancellation notice (issue #16). Leader/admin only. The delete runs
// with the service role so it succeeds regardless of who the assignee is.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { logEmail } from '../_shared/email-log.ts'
import { schedulingCancellationEmail } from '../_shared/email-templates/scheduling.ts'
import { sendEmail } from '../_shared/resend.ts'
import {
  formatPlanDateLong,
  formatStartTime,
  planTimesLine,
} from '../_shared/scheduling.ts'

const requestSchema = z.object({
  assignmentId: z.uuid(),
})

interface AssignmentRow {
  id: string
  status: string
  plan_id: string
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
    start_time: string | null
    service_types: { name: string; default_start_time: string | null }
  }
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
    return jsonResponse({ error: 'Only leaders can remove people' }, 403)
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { assignmentId } = parsed.data

  const { data: assignment } = await admin
    .from('plan_assignments')
    .select(
      `id, status, plan_id,
       people(id, first_name, last_name, email, status),
       positions(name), teams(name),
       plans!inner(id, date, title, start_time, service_types(name, default_start_time))`,
    )
    .eq('id', assignmentId)
    .maybeSingle()
  if (!assignment) return jsonResponse({ error: 'Assignment not found' }, 404)

  const row = assignment as unknown as AssignmentRow
  const person = row.people

  // Only people who had already confirmed get a cancellation notice.
  let notified = false
  if (row.status === 'confirmed' && person.email && person.status === 'active') {
    const { data: church } = await admin
      .from('church_settings')
      .select('name, email_from_name')
      .maybeSingle()
    const churchName = church?.name ?? 'LSCRoster'
    const fromName = church?.email_from_name ?? churchName

    const { subject, html } = schedulingCancellationEmail({
      churchName,
      recipientName: person.first_name,
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
    })
    const result = await sendEmail({ to: person.email, subject, html, fromName })
    await logEmail(admin, {
      to: person.email,
      template: 'scheduling-cancellation',
      subject,
      result,
      personId: person.id,
      planId: row.plan_id,
    })
    notified = result.sent
  }

  const { error: deleteError } = await admin
    .from('plan_assignments')
    .delete()
    .eq('id', assignmentId)
  if (deleteError) {
    console.error('Assignment delete failed:', deleteError)
    return jsonResponse({ error: 'Could not remove assignment' }, 500)
  }

  return jsonResponse({ ok: true, notified })
})
