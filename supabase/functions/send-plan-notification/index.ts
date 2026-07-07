// Emails a full plan summary to everyone scheduled on a plan (issue #17),
// triggered when a leader publishes the plan. Leader/admin only. Each person is
// emailed once even if they fill several positions; declined people are skipped.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchEmailPrefs, prefAllows, resolveRecipient } from '../_shared/email-prefs.ts'
import { logEmail } from '../_shared/email-log.ts'
import { isEmailableActive } from '../_shared/person-status.ts'
import { planNotificationEmail } from '../_shared/email-templates/plan-notification.ts'
import { sendEmailBatch } from '../_shared/resend.ts'
import {
  appUrl,
  clockFromBase,
  formatDurationSeconds,
  formatPlanDateLong,
  formatStartTime,
} from '../_shared/scheduling.ts'

const requestSchema = z.object({
  planId: z.uuid(),
})

interface AssignmentRow {
  status: string
  people: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    status: string
    auth_user_id: string | null
    managed_by_person_id: string | null
    managed_accepted_at: string | null
  }
  teams: { id: string; name: string; sort_order: number }
  positions: { name: string; sort_order: number }
}

interface ItemRow {
  kind: 'header' | 'song' | 'item'
  title: string
  arrangement_id: string | null
  key_override: string | null
  length_seconds: number
  description: string | null
  sort_order: number
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
    return jsonResponse({ error: 'Only leaders can notify a plan' }, 403)
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { planId } = parsed.data

  const { data: plan } = await admin
    .from('plans')
    .select(
      'id, date, title, start_time, service_type_id, service_types(name, default_start_time, end_time)',
    )
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404)

  const serviceType = plan.service_types as unknown as {
    name: string
    default_start_time: string | null
    end_time: string | null
  }

  const { data: church } = await admin
    .from('church_settings')
    .select('name, address, email_from_name, notify_on_publish')
    .maybeSingle()
  // Master switch: an admin can disable publish emails church-wide (issue #88).
  if (church && church.notify_on_publish === false) {
    return jsonResponse({ ok: true, sent: 0, skipped: [] })
  }
  const churchName = church?.name ?? 'LSCroster'
  const fromName = church?.email_from_name ?? churchName

  // -- the plan's labelled times -------------------------------------------
  const { data: timeRows } = await admin
    .from('plan_times')
    .select('label, start_time, sort_order')
    .eq('plan_id', planId)
  const times = (timeRows ?? [])
    .sort((a, b) => a.sort_order - b.sort_order || a.start_time.localeCompare(b.start_time))
    .map((t) => ({ label: t.label as string, time: formatStartTime(t.start_time) }))

  // -- order of service + songs --------------------------------------------
  const { data: itemRows } = await admin
    .from('plan_items')
    .select('kind, title, arrangement_id, key_override, length_seconds, description, sort_order')
    .eq('plan_id', planId)
  const items = ((itemRows ?? []) as ItemRow[]).sort(
    (a, b) => a.sort_order - b.sort_order,
  )

  // Key/BPM/meter come straight off the item's arrangement (#130).
  const arrangementIds = [
    ...new Set(items.filter((i) => i.arrangement_id).map((i) => i.arrangement_id!)),
  ]
  const arrangementById = new Map<
    string,
    { song_key: string | null; bpm: number | null; meter: string | null }
  >()
  if (arrangementIds.length > 0) {
    const { data: arrRows } = await admin
      .from('song_arrangements')
      .select('id, song_key, bpm, meter')
      .in('id', arrangementIds)
    for (const a of arrRows ?? []) {
      arrangementById.set(a.id as string, {
        song_key: a.song_key,
        bpm: a.bpm,
        meter: a.meter,
      })
    }
  }

  // The plan's own start-time override wins over the service-type default.
  const planStartOverride = (plan as { start_time: string | null }).start_time
  const start = planStartOverride ?? serviceType.default_start_time
  let offset = 0
  const order = items.map((item) => {
    const isHeader = item.kind === 'header'
    const time = isHeader ? null : clockFromBase(start, offset)
    offset += item.length_seconds
    return {
      time,
      title: item.title,
      isHeader,
      detail: item.description,
    }
  })
  const totalSeconds = offset
  const durationLabel = formatDurationSeconds(totalSeconds)
  const startTime = formatStartTime(start)
  // With an overridden start, the service-type end no longer lines up, so fall
  // back to the order-of-service-derived end.
  const endTime =
    serviceType.end_time && !planStartOverride
      ? formatStartTime(serviceType.end_time)
      : clockFromBase(start, totalSeconds)

  const songs = items
    .filter((i) => i.kind === 'song')
    .map((i) => {
      const arrangement = i.arrangement_id
        ? arrangementById.get(i.arrangement_id)
        : undefined
      return {
        title: i.title,
        key: i.key_override ?? arrangement?.song_key ?? null,
        bpm: arrangement?.bpm ?? null,
        meter: arrangement?.meter ?? null,
      }
    })

  // -- who's serving (grouped by team) + recipient list --------------------
  const { data: assignmentRows } = await admin
    .from('plan_assignments')
    .select(
      'status, people(id, first_name, last_name, email, status, auth_user_id, managed_by_person_id, managed_accepted_at), teams(id, name, sort_order), positions(name, sort_order)',
    )
    .eq('plan_id', planId)
    .neq('status', 'declined')
  const assignments = (assignmentRows ?? []) as unknown as AssignmentRow[]

  // Teams follow the plan's service type's stored order (service_type_teams
  // .sort_order), matching the plan page — not the team's global sort_order,
  // which fell back to alphabetical (issue #129). Teams that serve every service
  // type (no join row) fall after, keeping their global order — mirrors the
  // frontend `serviceTypeTeamSort`.
  const { data: stTeamRows } = await admin
    .from('service_type_teams')
    .select('team_id, sort_order')
    .eq('service_type_id', plan.service_type_id)
  const serviceTypeTeamSort = new Map<string, number>(
    (stTeamRows ?? []).map((r) => [r.team_id as string, r.sort_order as number]),
  )
  const teamSortKey = (id: string, globalSort: number) =>
    serviceTypeTeamSort.has(id) ? serviceTypeTeamSort.get(id)! : 1_000_000 + globalSort

  const teamMap = new Map<
    string,
    { id: string; name: string; sort_order: number; members: { position: string; positionSort: number; name: string }[] }
  >()
  for (const a of assignments) {
    const key = a.teams.id
    if (!teamMap.has(key)) {
      teamMap.set(key, {
        id: a.teams.id,
        name: a.teams.name,
        sort_order: a.teams.sort_order,
        members: [],
      })
    }
    teamMap.get(key)!.members.push({
      position: a.positions.name,
      positionSort: a.positions.sort_order,
      name: `${a.people.first_name} ${a.people.last_name}`.trim(),
    })
  }
  const teams = [...teamMap.values()]
    .sort(
      (a, b) =>
        teamSortKey(a.id, a.sort_order) - teamSortKey(b.id, b.sort_order) ||
        a.name.localeCompare(b.name),
    )
    .map((t) => ({
      name: t.name,
      members: t.members
        .sort((a, b) => a.positionSort - b.positionSort || a.name.localeCompare(b.name))
        .map((m) => ({ position: m.position, name: m.name })),
    }))

  const planDateLong = formatPlanDateLong(plan.date)

  // Recipients: one email per active person who hasn't opted out of publish
  // emails (issue #87). A person without their own address is routed to their
  // managing member (issue #89). Render each, then send in one Batch API call.
  const activePersonIds = assignments
    .filter((a) => isEmailableActive(a.people))
    .map((a) => a.people.id)
  const prefs = await fetchEmailPrefs(admin, activePersonIds)

  const outbound: {
    personId: string
    email: string
    firstName: string
    subject: string
    html: string
  }[] = []
  const seen = new Set<string>()
  for (const a of assignments) {
    const p = a.people
    if (!isEmailableActive(p) || seen.has(p.id)) continue
    seen.add(p.id)
    if (!prefAllows(prefs, p.id, 'publish_emails')) continue
    const recipient = await resolveRecipient(admin, p)
    if (!recipient) continue
    const { subject, html } = planNotificationEmail({
      churchName,
      churchAddress: church?.address ?? null,
      recipientName: recipient.recipientName,
      onBehalfOf: recipient.onBehalfOf,
      planDateLong,
      serviceTypeName: serviceType.name,
      planTitle: plan.title,
      startTime,
      endTime,
      durationLabel,
      times,
      teams,
      order,
      songs,
      appUrl: appUrl(),
    })
    outbound.push({
      personId: p.id,
      email: recipient.email,
      firstName: recipient.recipientName,
      subject,
      html,
    })
  }

  const results = await sendEmailBatch(
    outbound.map((o) => ({
      to: o.email,
      subject: o.subject,
      html: o.html,
      fromName,
    })),
  )

  await Promise.all(
    outbound.map((o, idx) =>
      logEmail(admin, {
        to: o.email,
        template: 'plan-notification',
        subject: o.subject,
        result: results[idx],
        personId: o.personId,
        planId,
      }),
    ),
  )

  let sent = 0
  const skipped: { name: string; reason: string }[] = []
  outbound.forEach((o, idx) => {
    const result = results[idx]
    if (result.sent) {
      sent++
    } else {
      skipped.push({
        name: o.firstName,
        reason:
          result.reason === 'not_configured'
            ? 'email not configured'
            : 'email provider error',
      })
    }
  })

  return jsonResponse({ ok: true, sent, skipped })
})
