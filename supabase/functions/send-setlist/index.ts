// Emails the worship set list to the admin-curated distribution list
// (issue #133), on publish or on demand from the plan page. Leader/admin only.
//
// The email body *is* the set list (see email-templates/setlist.ts): service
// information with the worship-type teams' roster, practice information, the
// song list and the plan's notes, plus a link to download the lyrics sheet
// PDF from the app. No attachment — so the whole send fits in one Batch API
// call and never worries Resend's 2 req/s throttle.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { resolveRecipient } from '../_shared/email-prefs.ts'
import { logEmail } from '../_shared/email-log.ts'
import { isEmailableActive } from '../_shared/person-status.ts'
import { setlistEmail } from '../_shared/email-templates/setlist.ts'
import { sendEmailBatch } from '../_shared/resend.ts'
import { appUrl, formatPlanDateLong, formatStartTime } from '../_shared/scheduling.ts'

// Keeps a send-out well inside Resend's monthly free tier; also the Batch
// API's per-call ceiling is 100.
const MAX_RECIPIENTS = 50

const requestSchema = z.object({
  planId: z.uuid(),
})

interface PersonRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  auth_user_id: string | null
  managed_by_person_id: string | null
  managed_accepted_at: string | null
}

interface ServingRow {
  status: string
  people: { first_name: string; last_name: string } | null
  teams: { id: string; name: string; sort_order: number; team_type: string } | null
  positions: { name: string; sort_order: number } | null
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
    return jsonResponse({ error: 'Only leaders can email the set list' }, 403)
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { planId } = parsed.data

  const { data: plan } = await admin
    .from('plans')
    .select('id, date, title, notes, service_type_id, service_types(name)')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404)
  const serviceTypeName = (plan.service_types as unknown as { name: string }).name

  const { data: church } = await admin
    .from('church_settings')
    .select('name, address, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCroster'
  const fromName = church?.email_from_name ?? churchName

  // -- resolve the distribution list ----------------------------------------
  const { data: recipientRows } = await admin
    .from('setlist_recipients')
    .select('person_id, team_id')
  const personIds = new Set<string>(
    (recipientRows ?? []).filter((r) => r.person_id).map((r) => r.person_id as string),
  )
  const teamIds = (recipientRows ?? [])
    .filter((r) => r.team_id)
    .map((r) => r.team_id as string)
  if (teamIds.length > 0) {
    const { data: memberRows } = await admin
      .from('team_members')
      .select('person_id')
      .in('team_id', teamIds)
    for (const m of memberRows ?? []) personIds.add(m.person_id as string)
  }
  if (personIds.size === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: [], noRecipients: true })
  }

  const { data: peopleRows } = await admin
    .from('people')
    .select(
      'id, first_name, last_name, email, status, auth_user_id, managed_by_person_id, managed_accepted_at',
    )
    .in('id', [...personIds])
  const people = ((peopleRows ?? []) as PersonRow[]).filter(isEmailableActive)

  if (people.length > MAX_RECIPIENTS) {
    return jsonResponse(
      {
        error:
          `The set list would go to ${people.length} people — the limit is ` +
          `${MAX_RECIPIENTS}. Trim the recipient list in Settings → ` +
          'Communications setup.',
      },
      400,
    )
  }

  // -- who's serving: worship-type teams only (issue #133) ------------------
  const { data: servingRows } = await admin
    .from('plan_assignments')
    .select(
      'status, people(first_name, last_name), teams(id, name, sort_order, team_type), positions(name, sort_order)',
    )
    .eq('plan_id', planId)
    .neq('status', 'declined')
  // Teams follow the plan's service type's stored order (issue #129).
  const { data: stTeamRows } = await admin
    .from('service_type_teams')
    .select('team_id, sort_order')
    .eq('service_type_id', plan.service_type_id)
  const serviceTypeTeamSort = new Map<string, number>(
    (stTeamRows ?? []).map((r) => [r.team_id as string, r.sort_order as number]),
  )
  const teamSortKey = (id: string, globalSort: number) =>
    serviceTypeTeamSort.get(id) ?? 1_000_000 + globalSort

  interface TeamGroup {
    id: string
    name: string
    sort: number
    members: { name: string; position: string; positionSort: number }[]
  }
  const teamGroups = new Map<string, TeamGroup>()
  for (const row of (servingRows ?? []) as unknown as ServingRow[]) {
    if (!row.teams || !row.positions || !row.people) continue
    if (row.teams.team_type !== 'worship') continue
    let group = teamGroups.get(row.teams.id)
    if (!group) {
      group = {
        id: row.teams.id,
        name: row.teams.name,
        sort: row.teams.sort_order,
        members: [],
      }
      teamGroups.set(row.teams.id, group)
    }
    group.members.push({
      name: `${row.people.first_name} ${row.people.last_name}`.trim(),
      position: row.positions.name,
      positionSort: row.positions.sort_order,
    })
  }
  const serving = [...teamGroups.values()]
    .sort(
      (a, b) =>
        teamSortKey(a.id, a.sort) - teamSortKey(b.id, b.sort) ||
        a.name.localeCompare(b.name),
    )
    .map((t) => ({
      team: t.name,
      members: t.members
        .sort((a, b) => a.positionSort - b.positionSort || a.name.localeCompare(b.name))
        .map((m) => `${m.name} (${m.position})`)
        .join(' / '),
    }))

  // -- times, songs, notes ---------------------------------------------------
  const { data: timeRows } = await admin
    .from('plan_times')
    .select('label, start_time, sort_order')
    .eq('plan_id', planId)
  const times = (timeRows ?? [])
    .sort((a, b) => a.sort_order - b.sort_order || a.start_time.localeCompare(b.start_time))
    .map((t) => ({ label: t.label as string, time: formatStartTime(t.start_time) }))

  const { data: itemRows } = await admin
    .from('plan_items')
    .select('kind, title, arrangement_id, key_override, description, sort_order')
    .eq('plan_id', planId)
  const songItems = (itemRows ?? [])
    .filter((i) => i.kind === 'song')
    .sort((a, b) => a.sort_order - b.sort_order)
  const arrangementIds = [
    ...new Set(songItems.filter((i) => i.arrangement_id).map((i) => i.arrangement_id!)),
  ]
  const arrangementById = new Map<
    string,
    { song_key: string | null; bpm: number | null; meter: string | null; reference_url: string | null }
  >()
  if (arrangementIds.length > 0) {
    const { data: arrRows } = await admin
      .from('song_arrangements')
      .select('id, song_key, bpm, meter, reference_url')
      .in('id', arrangementIds)
    for (const a of arrRows ?? []) {
      arrangementById.set(a.id as string, {
        song_key: a.song_key,
        bpm: a.bpm,
        meter: a.meter,
        reference_url: a.reference_url,
      })
    }
  }
  const songs = songItems.map((i) => {
    const arr = i.arrangement_id ? arrangementById.get(i.arrangement_id) : undefined
    return {
      title: i.title,
      detail: i.description,
      // "Leave empty if not present" — no search-link fallback here.
      referenceUrl: arr?.reference_url ?? null,
      key: i.key_override ?? arr?.song_key ?? null,
      meter: arr?.meter ?? null,
      bpm: arr?.bpm ?? null,
    }
  })

  const planDateLong = formatPlanDateLong(plan.date)

  // -- render per recipient, send as one batch -------------------------------
  // Emails to the explicit distribution list don't check per-person
  // publish-email prefs — an admin put these people on the list on purpose.
  const outbound: { personId: string; name: string; email: string; subject: string; html: string }[] = []
  const skipped: { name: string; reason: string }[] = []
  const seenEmails = new Set<string>()
  for (const person of people) {
    const displayName = `${person.first_name} ${person.last_name}`.trim()
    const recipient = await resolveRecipient(admin, person)
    if (!recipient) {
      skipped.push({ name: displayName, reason: 'no email address' })
      continue
    }
    const emailKey = recipient.email.toLowerCase()
    if (seenEmails.has(emailKey)) continue
    seenEmails.add(emailKey)

    const { subject, html } = setlistEmail({
      churchName,
      churchAddress: church?.address ?? null,
      recipientName: recipient.recipientName,
      onBehalfOf: recipient.onBehalfOf,
      planDateLong,
      serviceTypeName,
      planTitle: plan.title,
      serving,
      times,
      songs,
      notes: plan.notes,
      planId,
      appUrl: appUrl(),
    })
    outbound.push({ personId: person.id, name: displayName, email: recipient.email, subject, html })
  }

  const results = await sendEmailBatch(
    outbound.map((o) => ({ to: o.email, subject: o.subject, html: o.html, fromName })),
  )
  await Promise.all(
    outbound.map((o, idx) =>
      logEmail(admin, {
        to: o.email,
        template: 'setlist',
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
