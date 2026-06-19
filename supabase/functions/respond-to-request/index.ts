// Accept/decline a scheduling request via the signed token from the email.
// No login required (verify_jwt = false); the token itself is the credential.
// POST { token } returns the request details; POST { token, action, reason? }
// records the response. Links stay answerable until the service date passes,
// and answers can be changed (last response wins).

import { z } from 'npm:zod@4'
import { serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  formatPlanDateLong,
  formatStartTime,
  planTimesLine,
  sha256Hex,
  todayInTimezone,
} from '../_shared/scheduling.ts'

const respondSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  action: z.enum(['accept', 'decline']).optional(),
  reason: z.string().max(500).optional(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const parsed = respondSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { token, action, reason } = parsed.data

  const admin = serviceClient()
  const { data: assignment } = await admin
    .from('plan_assignments')
    .select(
      `id, status, responded_at,
       people(first_name),
       positions(name),
       teams(name),
       plans(id, date, title, status, start_time, service_types(name, default_start_time))`,
    )
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()

  if (!assignment) {
    return jsonResponse({ error: 'This link is invalid or has been replaced' }, 404)
  }

  const { data: church } = await admin
    .from('church_settings')
    .select('name, timezone')
    .maybeSingle()
  const timezone = church?.timezone ?? 'Australia/Sydney'

  if (assignment.plans.date < todayInTimezone(timezone)) {
    return jsonResponse({ error: 'This service date has already passed' }, 410)
  }

  if (action) {
    const { error } = await admin
      .from('plan_assignments')
      .update({
        status: action === 'accept' ? 'confirmed' : 'declined',
        responded_at: new Date().toISOString(),
        decline_reason: action === 'decline' ? (reason?.trim() || null) : null,
      })
      .eq('id', assignment.id)
    if (error) {
      console.error('Response update failed:', error)
      return jsonResponse({ error: 'Failed to record your response' }, 500)
    }
    assignment.status = action === 'accept' ? 'confirmed' : 'declined'
    assignment.responded_at = new Date().toISOString()
  }

  return jsonResponse({
    ok: true,
    churchName: church?.name ?? 'LSCRoster',
    firstName: assignment.people.first_name,
    planDateLong: formatPlanDateLong(assignment.plans.date),
    startTime: await planTimesLine(
      admin,
      assignment.plans.id,
      formatStartTime(
        assignment.plans.start_time ?? assignment.plans.service_types.default_start_time,
      ),
    ),
    serviceTypeName: assignment.plans.service_types.name,
    planTitle: assignment.plans.title,
    teamName: assignment.teams.name,
    positionName: assignment.positions.name,
    status: assignment.status,
    respondedAt: assignment.responded_at,
  })
})
