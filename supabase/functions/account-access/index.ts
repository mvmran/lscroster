// Archives / reactivates a person, or clears the email of an existing account,
// and emails the person about the resulting sign-in change (issues #91, #92).
// Admin-only. The status triggers already ban/unban the auth account; clearing
// an email additionally deletes the linked auth account so the person reverts to
// a fresh, invitable record.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  accessReinstatedEmail,
  accessRevokedEmail,
} from '../_shared/email-templates/account-access.ts'
import { logEmail } from '../_shared/email-log.ts'
import { sendEmail } from '../_shared/resend.ts'

const schema = z.object({
  personId: z.uuid(),
  action: z.enum(['archive', 'reactivate', 'clear-email']),
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
    return jsonResponse({ error: 'Only admins can change account access' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { personId, action } = parsed.data

  if (personId === caller.id) {
    return jsonResponse({ error: 'You cannot change your own access here' }, 400)
  }

  const { data: person } = await admin
    .from('people')
    .select('id, first_name, last_name, email, auth_user_id, status')
    .eq('id', personId)
    .maybeSingle()
  if (!person) return jsonResponse({ error: 'Person not found' }, 404)

  const { data: church } = await admin
    .from('church_settings')
    .select('name, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCRoster'
  const fromName = church?.email_from_name ?? churchName

  // Build the status/auth change and the notice to send before doing the work.
  let notice: { subject: string; html: string } | null = null
  const notifyEmail = person.email

  if (action === 'archive') {
    if (person.status === 'inactive') {
      return jsonResponse({ error: 'Already archived' }, 400)
    }
    const { error } = await admin
      .from('people')
      .update({ status: 'inactive' })
      .eq('id', personId)
    if (error) {
      console.error('archive failed:', error)
      return jsonResponse({ error: 'Failed to archive' }, 500)
    }
    // Only people who actually had a login are told it was revoked.
    if (person.auth_user_id) {
      notice = accessRevokedEmail({ churchName, recipientName: person.first_name })
    }
  } else if (action === 'reactivate') {
    if (person.status === 'active') {
      return jsonResponse({ error: 'Already active' }, 400)
    }
    const { error } = await admin
      .from('people')
      .update({ status: 'active' })
      .eq('id', personId)
    if (error) {
      console.error('reactivate failed:', error)
      return jsonResponse({ error: 'Failed to reactivate' }, 500)
    }
    if (person.auth_user_id) {
      notice = accessReinstatedEmail({ churchName, recipientName: person.first_name })
    }
  } else {
    // clear-email: the person had a login tied to an email that is being removed.
    // Notify the OLD address first, then tear down the auth account so the record
    // reverts to a fresh, invitable state (status stays active → "Pending").
    if (!person.email) {
      return jsonResponse({ error: 'Person has no email to clear' }, 400)
    }
    notice = accessRevokedEmail({ churchName, recipientName: person.first_name })
    // Send the notice up-front, while we still hold the address.
    if (notifyEmail) {
      const result = await sendEmail({
        to: notifyEmail,
        subject: notice.subject,
        html: notice.html,
        fromName,
      })
      await logEmail(admin, {
        to: notifyEmail,
        template: 'access-revoked',
        subject: notice.subject,
        result,
        personId,
      })
    }
    notice = null // already sent

    if (person.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(person.auth_user_id)
      if (error) {
        console.error('deleteUser failed:', error)
        return jsonResponse({ error: 'Failed to remove sign-in access' }, 500)
      }
    }
    // Drop the email and any pending invitation; the FK already nulled
    // auth_user_id when the auth account was deleted.
    const { error: updateError } = await admin
      .from('people')
      .update({ email: null })
      .eq('id', personId)
    if (updateError) {
      console.error('clear email failed:', updateError)
      return jsonResponse({ error: 'Failed to clear email' }, 500)
    }
    await admin.from('invitations').delete().eq('person_id', personId)

    return jsonResponse({ ok: true })
  }

  // Archive / reactivate notice (when there is an address and a login).
  if (notice && notifyEmail) {
    const result = await sendEmail({
      to: notifyEmail,
      subject: notice.subject,
      html: notice.html,
      fromName,
    })
    await logEmail(admin, {
      to: notifyEmail,
      template: action === 'archive' ? 'access-revoked' : 'access-reinstated',
      subject: notice.subject,
      result,
      personId,
    })
  }

  return jsonResponse({ ok: true })
})
