// Emails the worship set-list PDF to the admin-curated distribution list
// (issue #133), on publish or on demand from the plan page. Leader/admin only.
//
// The PDF is generated client-side (jsPDF, like the run sheet and lyrics
// sheet) and arrives base64-encoded. Resend's Batch API doesn't accept
// attachments, so each recipient is one individual API call through the shared
// 550 ms rate limiter — which is why the recipient list is curated and capped
// rather than "everyone rostered".

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { resolveRecipient } from '../_shared/email-prefs.ts'
import { logEmail } from '../_shared/email-log.ts'
import { isEmailableActive } from '../_shared/person-status.ts'
import { setlistEmail } from '../_shared/email-templates/setlist.ts'
import { sendEmail } from '../_shared/resend.ts'
import { appUrl, formatPlanDateLong, formatStartTime } from '../_shared/scheduling.ts'

// Keeps a single send-out well inside Resend's monthly free tier and the
// function's wall-clock budget (~0.55s per recipient).
const MAX_RECIPIENTS = 50

const requestSchema = z.object({
  planId: z.uuid(),
  /** The set-list PDF, base64-encoded. ~8 MB base64 ≈ 6 MB PDF, ample. */
  pdfBase64: z
    .string()
    .min(1)
    .max(8_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  filename: z
    .string()
    .regex(/^[\w][\w .()-]{0,80}\.pdf$/)
    .default('set-list.pdf'),
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
  const { planId, pdfBase64, filename } = parsed.data

  const { data: plan } = await admin
    .from('plans')
    .select('id, date, title, service_types(name)')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404)
  const serviceTypeName =
    (plan.service_types as unknown as { name: string }).name

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
  const directPersonIds = (recipientRows ?? [])
    .filter((r) => r.person_id)
    .map((r) => r.person_id as string)
  const teamIds = (recipientRows ?? [])
    .filter((r) => r.team_id)
    .map((r) => r.team_id as string)

  const personIds = new Set<string>(directPersonIds)
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
          `${MAX_RECIPIENTS} because each email carries the PDF individually. ` +
          'Trim the recipient list in Settings → Communications setup.',
      },
      400,
    )
  }

  // -- song summary + times for the email body ------------------------------
  const { data: itemRows } = await admin
    .from('plan_items')
    .select('kind, title, arrangement_id, key_override, sort_order')
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
      key: i.key_override ?? arr?.song_key ?? null,
      bpm: arr?.bpm ?? null,
      meter: arr?.meter ?? null,
      referenceUrl: arr?.reference_url ?? null,
    }
  })

  const { data: timeRows } = await admin
    .from('plan_times')
    .select('label, start_time, sort_order')
    .eq('plan_id', planId)
  const times = (timeRows ?? [])
    .sort((a, b) => a.sort_order - b.sort_order || a.start_time.localeCompare(b.start_time))
    .map((t) => ({ label: t.label as string, time: formatStartTime(t.start_time) }))

  const planDateLong = formatPlanDateLong(plan.date)

  // -- send, one rate-limited email per recipient ----------------------------
  // Deliberately sequential: sendEmail's shared limiter spaces the calls so a
  // full list never trips Resend's 2 req/s throttle. Emails to the explicit
  // distribution list don't check per-person publish-email prefs — an admin
  // put these people on the list on purpose.
  let sent = 0
  const skipped: { name: string; reason: string }[] = []
  const seenEmails = new Set<string>()
  for (const person of people) {
    const recipient = await resolveRecipient(admin, person)
    const displayName = `${person.first_name} ${person.last_name}`.trim()
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
      times,
      songs,
      planId,
      appUrl: appUrl(),
    })
    const result = await sendEmail({
      to: recipient.email,
      subject,
      html,
      fromName,
      attachments: [{ filename, content: pdfBase64 }],
    })
    await logEmail(admin, {
      to: recipient.email,
      template: 'setlist',
      subject,
      result,
      personId: person.id,
      planId,
    })
    if (result.sent) {
      sent++
    } else {
      skipped.push({
        name: displayName,
        reason:
          result.reason === 'not_configured'
            ? 'email not configured'
            : 'email provider error',
      })
    }
  }

  return jsonResponse({ ok: true, sent, skipped })
})
