// Removes a plan assignment and, when the person has already been emailed about
// it (confirmed, or pending with the request already sent — issue #85), emails
// them a cancellation notice (issue #16). Honours the person's roster-email
// preference (issue #87) and routes to a managing member when the person has no
// email of their own (issue #89). Admins + the assignment's Team Leader only.
// The delete runs with the service role so it succeeds regardless of who the
// assignee is.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient, teamScopeFor } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchEmailPrefs, prefAllows, resolveRecipient } from '../_shared/email-prefs.ts'
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
  notified_at: string | null
  plan_id: string
  team_id: string
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = serviceClient()
  const caller = await getCallerPerson(req, admin)
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401)
  const scope = await teamScopeFor(admin, caller)
  if (!scope) {
    return jsonResponse({ error: 'You do not manage any team' }, 403)
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { assignmentId } = parsed.data

  const { data: assignment } = await admin
    .from('plan_assignments')
    .select(
      `id, status, notified_at, plan_id, team_id,
       people(id, first_name, last_name, email, status, managed_by_person_id),
       positions(name), teams(name),
       plans!inner(id, date, title, start_time, service_types(name, default_start_time))`,
    )
    .eq('id', assignmentId)
    .maybeSingle()
  if (!assignment) return jsonResponse({ error: 'Assignment not found' }, 404)

  const row = assignment as unknown as AssignmentRow
  // A Team Leader can only remove people from their own teams (admins: any).
  if (!scope.canManageTeam(row.team_id)) {
    return jsonResponse({ error: 'Not your team' }, 403)
  }
  const person = row.people

  // Notify anyone who has already been emailed about this slot: confirmed
  // people, and pending people whose request has gone out (issue #85). People
  // who were never emailed are removed silently.
  const wasEmailed =
    row.status === 'confirmed' ||
    (row.status === 'pending' && row.notified_at !== null)

  let notified = false
  if (wasEmailed && person.status === 'active') {
    const prefs = await fetchEmailPrefs(admin, [person.id])
    const recipient = prefAllows(prefs, person.id, 'roster_emails')
      ? await resolveRecipient(admin, person)
      : null
    if (recipient) {
      const { data: church } = await admin
        .from('church_settings')
        .select('name, email_from_name')
        .maybeSingle()
      const churchName = church?.name ?? 'LSCroster'
      const fromName = church?.email_from_name ?? churchName

      const { subject, html } = schedulingCancellationEmail({
        churchName,
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
      })
      const result = await sendEmail({ to: recipient.email, subject, html, fromName })
      await logEmail(admin, {
        to: recipient.email,
        template: 'scheduling-cancellation',
        subject,
        result,
        personId: person.id,
        planId: row.plan_id,
      })
      notified = result.sent
    }
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
