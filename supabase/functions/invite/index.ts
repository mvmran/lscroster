// Creates (or revokes) an invitation for a person and emails them a
// set-your-password link. Admin-only. The raw token goes only into the email;
// the database stores its sha-256 hash.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  invitationEmail,
  managedInvitationEmail,
} from '../_shared/email-templates/invitation.ts'
import { logEmail } from '../_shared/email-log.ts'
import { sendEmail } from '../_shared/resend.ts'
import { appUrl, randomToken, sha256Hex } from '../_shared/scheduling.ts'

const INVITE_EXPIRY_DAYS = 7

const inviteSchema = z.object({
  personId: z.uuid(),
  action: z.enum(['send', 'revoke']).default('send'),
})

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
  if (caller.role !== 'admin') {
    return jsonResponse({ error: 'Only admins can manage invitations' }, 403)
  }

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse({ error: 'Invalid request' }, 400)
  }
  const { personId, action } = parsed.data

  if (action === 'revoke') {
    const { error } = await admin
      .from('invitations')
      .delete()
      .eq('person_id', personId)
    if (error) return jsonResponse({ error: 'Failed to revoke invitation' }, 500)
    return jsonResponse({ ok: true })
  }

  const { data: person } = await admin
    .from('people')
    .select('id, first_name, last_name, email, auth_user_id, status, managed_by_person_id')
    .eq('id', personId)
    .maybeSingle()
  if (!person) return jsonResponse({ error: 'Person not found' }, 404)
  if (person.auth_user_id) {
    return jsonResponse({ error: 'This person already has an account' }, 400)
  }
  if (person.status !== 'active') {
    return jsonResponse({ error: 'Cannot invite an inactive person' }, 400)
  }

  // Managed invite (issue #89): a managing member is attached — send the
  // confirmation to that member instead, even when the person has an email of
  // their own (the People page offers a manager to them too; a standard invite
  // here would let them sign up themselves). accept-invitation decides alike.
  const managed = !!person.managed_by_person_id
  let manager: { first_name: string; email: string | null; status: string } | null = null
  if (managed) {
    const { data: m } = await admin
      .from('people')
      .select('first_name, email, status')
      .eq('id', person.managed_by_person_id!)
      .maybeSingle()
    manager = m as typeof manager
    if (!manager?.email || manager.status !== 'active') {
      return jsonResponse(
        { error: 'The managing member needs an active email address first' },
        400,
      )
    }
  } else if (!person.email) {
    return jsonResponse(
      { error: 'This person has no email — add one or assign a managing member first' },
      400,
    )
  }

  const token = randomToken()
  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error: upsertError } = await admin.from('invitations').upsert(
    {
      person_id: personId,
      token_hash: await sha256Hex(token),
      expires_at: expiresAt,
      accepted_at: null,
      // Where it went: accept-invitation refuses it once the address changes.
      email: managed ? manager!.email : person.email,
    },
    { onConflict: 'person_id' },
  )
  if (upsertError) {
    console.error('Invitation upsert failed:', upsertError)
    return jsonResponse({ error: 'Failed to create invitation' }, 500)
  }

  const { data: church } = await admin
    .from('church_settings')
    .select('name, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCroster'
  const inviteUrl = `${appUrl()}/invite/${token}`

  const { subject, html } = managed
    ? managedInvitationEmail({
        churchName,
        managerName: manager!.first_name,
        managedName: `${person.first_name} ${person.last_name}`.trim(),
        inviteUrl,
        expiresInDays: INVITE_EXPIRY_DAYS,
      })
    : invitationEmail({
        churchName,
        recipientName: person.first_name,
        inviteUrl,
        expiresInDays: INVITE_EXPIRY_DAYS,
      })
  const to = managed ? manager!.email! : person.email!
  const result = await sendEmail({
    to,
    subject,
    html,
    fromName: church?.email_from_name ?? churchName,
  })
  await logEmail(admin, {
    to,
    template: managed ? 'managed-invitation' : 'invitation',
    subject,
    result,
    personId,
  })

  if (!result.sent && result.reason === 'provider_error') {
    return jsonResponse({ error: 'Email provider rejected the request' }, 502)
  }
  if (!result.sent) {
    // Email isn't configured (e.g. local dev) — the invitation still exists,
    // so hand the link back for the admin to share manually.
    return jsonResponse({ ok: true, emailSent: false, inviteUrl })
  }
  return jsonResponse({ ok: true, emailSent: true })
})
