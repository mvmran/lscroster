// Emails a full plan summary to everyone scheduled on a plan (issue #17),
// triggered when a leader publishes the plan. Leader/admin only. Each person is
// emailed once even if they fill several positions; declined people are skipped.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { logEmail } from '../_shared/email-log.ts'
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
  }
  teams: { name: string; sort_order: number }
  positions: { name: string; sort_order: number }
}

interface ItemRow {
  kind: 'header' | 'song' | 'item'
  title: string
  song_id: string | null
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
    .select('id, date, title, service_types(name, default_start_time, end_time)')
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
    .select('name, address, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCRoster'
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
    .select('kind, title, song_id, key_override, length_seconds, description, sort_order')
    .eq('plan_id', planId)
  const items = ((itemRows ?? []) as ItemRow[]).sort(
    (a, b) => a.sort_order - b.sort_order,
  )

  const songIds = [...new Set(items.filter((i) => i.song_id).map((i) => i.song_id!))]
  // Key/BPM now live on the song's Default arrangement (issue #24).
  const songById = new Map<string, { default_key: string | null; bpm: number | null }>()
  if (songIds.length > 0) {
    const { data: arrRows } = await admin
      .from('song_arrangements')
      .select('song_id, song_key, bpm')
      .in('song_id', songIds)
      .eq('is_default', true)
    for (const a of arrRows ?? []) {
      songById.set(a.song_id as string, { default_key: a.song_key, bpm: a.bpm })
    }
  }

  const start = serviceType.default_start_time
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
  const endTime = serviceType.end_time
    ? formatStartTime(serviceType.end_time)
    : clockFromBase(start, totalSeconds)

  const songs = items
    .filter((i) => i.kind === 'song')
    .map((i) => {
      const song = i.song_id ? songById.get(i.song_id) : undefined
      return {
        title: i.title,
        key: i.key_override ?? song?.default_key ?? null,
        bpm: song?.bpm ?? null,
      }
    })

  // -- who's serving (grouped by team) + recipient list --------------------
  const { data: assignmentRows } = await admin
    .from('plan_assignments')
    .select(
      'status, people(id, first_name, last_name, email, status), teams(name, sort_order), positions(name, sort_order)',
    )
    .eq('plan_id', planId)
    .neq('status', 'declined')
  const assignments = (assignmentRows ?? []) as unknown as AssignmentRow[]

  const teamMap = new Map<
    string,
    { name: string; sort_order: number; members: { position: string; positionSort: number; name: string }[] }
  >()
  for (const a of assignments) {
    const key = a.teams.name
    if (!teamMap.has(key)) {
      teamMap.set(key, { name: a.teams.name, sort_order: a.teams.sort_order, members: [] })
    }
    teamMap.get(key)!.members.push({
      position: a.positions.name,
      positionSort: a.positions.sort_order,
      name: `${a.people.first_name} ${a.people.last_name}`.trim(),
    })
  }
  const teams = [...teamMap.values()]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      members: t.members
        .sort((a, b) => a.positionSort - b.positionSort || a.name.localeCompare(b.name))
        .map((m) => ({ position: m.position, name: m.name })),
    }))

  // Recipients: one email per active person with an address.
  const recipients = new Map<string, { firstName: string; email: string }>()
  for (const a of assignments) {
    const p = a.people
    if (p.status === 'active' && p.email && !recipients.has(p.id)) {
      recipients.set(p.id, { firstName: p.first_name, email: p.email })
    }
  }

  const planDateLong = formatPlanDateLong(plan.date)

  // Render one email per recipient, then send them all in one Batch API call
  // (issue #18).
  const outbound = [...recipients].map(([personId, recipient]) => {
    const { subject, html } = planNotificationEmail({
      churchName,
      churchAddress: church?.address ?? null,
      recipientName: recipient.firstName,
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
    return { personId, recipient, subject, html }
  })

  const results = await sendEmailBatch(
    outbound.map((o) => ({
      to: o.recipient.email,
      subject: o.subject,
      html: o.html,
      fromName,
    })),
  )

  await Promise.all(
    outbound.map((o, idx) =>
      logEmail(admin, {
        to: o.recipient.email,
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
        name: o.recipient.firstName,
        reason:
          result.reason === 'not_configured'
            ? 'email not configured'
            : 'email provider error',
      })
    }
  })

  return jsonResponse({ ok: true, sent, skipped })
})
