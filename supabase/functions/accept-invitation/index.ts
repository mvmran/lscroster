// Public endpoint (verify_jwt = false) for invitation links. Two actions:
//   info   — validate a token and return greeting details for the accept page
//   accept — set the password: create the auth user, link people.auth_user_id,
//            mark the invitation accepted
// Tokens are validated against their sha-256 hash and single-use.

import { z } from 'npm:zod@4'
import { serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('info'),
    token: z.string().min(32).max(128),
  }),
  z.object({
    action: z.literal('accept'),
    token: z.string().min(32).max(128),
    // Omitted for a managed-account confirmation (the manager already has a
    // login); required when the person is creating their own account.
    password: z.string().min(8).max(200).optional(),
  }),
])

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse({ error: 'Invalid request' }, 400)
  }

  const admin = serviceClient()
  const tokenHash = await sha256Hex(parsed.data.token)

  const { data: invitation } = await admin
    .from('invitations')
    .select(
      'id, expires_at, accepted_at, person:people(id, first_name, last_name, email, auth_user_id, managed_by_person_id)',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  const person = invitation?.person as {
    id: string
    first_name: string
    last_name: string
    email: string | null
    auth_user_id: string | null
    managed_by_person_id: string | null
  } | null

  if (!invitation || !person) {
    return jsonResponse(
      { error: 'This invitation link is invalid. Ask your admin for a new one.' },
      404,
    )
  }
  if (invitation.accepted_at || person.auth_user_id) {
    return jsonResponse(
      { error: 'This invitation has already been used. Try signing in instead.' },
      410,
    )
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return jsonResponse(
      { error: 'This invitation has expired. Ask your admin to send a new one.' },
      410,
    )
  }

  // Managed account (issue #89): no email of their own, a managing member is
  // attached. The manager confirms — no new login is created for this person.
  const managed = !person.email && !!person.managed_by_person_id
  if (!person.email && !managed) {
    return jsonResponse({ error: 'This invitation is no longer valid' }, 410)
  }

  const { data: church } = await admin
    .from('church_settings')
    .select('name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCRoster'

  if (parsed.data.action === 'info') {
    if (managed) {
      const { data: manager } = await admin
        .from('people')
        .select('first_name')
        .eq('id', person.managed_by_person_id!)
        .maybeSingle()
      return jsonResponse({
        managed: true,
        churchName,
        managerName: manager?.first_name ?? 'You',
        managedName: `${person.first_name} ${person.last_name}`.trim(),
      })
    }
    return jsonResponse({
      managed: false,
      firstName: person.first_name,
      email: person.email,
      churchName,
    })
  }

  // -- accept ---------------------------------------------------------------
  if (managed) {
    const { error: stampError } = await admin
      .from('people')
      .update({ managed_accepted_at: new Date().toISOString() })
      .eq('id', person.id)
    if (stampError) {
      console.error('Managed accept failed:', stampError)
      return jsonResponse({ error: 'Could not finish setting up this account' }, 500)
    }
    await admin
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
    return jsonResponse({ ok: true, managed: true })
  }

  if (!parsed.data.password) {
    return jsonResponse({ error: 'A password is required' }, 400)
  }

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email: person.email!,
      password: parsed.data.password,
      email_confirm: true,
    })
  if (userError || !userData.user) {
    console.error('createUser failed:', userError)
    const message = userError?.message?.includes('already been registered')
      ? 'An account with this email already exists. Try signing in instead.'
      : 'Could not create your account. Please try again.'
    return jsonResponse({ error: message }, 500)
  }

  const { error: linkError } = await admin
    .from('people')
    .update({ auth_user_id: userData.user.id })
    .eq('id', person.id)
  if (linkError) {
    console.error('auth link failed:', linkError)
    await admin.auth.admin.deleteUser(userData.user.id)
    return jsonResponse({ error: 'Could not finish setting up your account' }, 500)
  }

  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  return jsonResponse({ ok: true, email: person.email })
})
