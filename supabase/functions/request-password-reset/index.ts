// Public endpoint (verify_jwt = false): emails a password-reset link via Resend,
// keeping all transactional email on our own pipeline (issue #39), mirroring the
// invite flow rather than Supabase Auth's built-in mailer.
//
// Account-enumeration safe: it always returns the same success response whether
// or not the email belongs to an account. Unknown emails send nothing and leak
// nothing to the caller.

import { z } from 'npm:zod@4'
import { serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { logEmail } from '../_shared/email-log.ts'
import { passwordResetEmail } from '../_shared/email-templates/password-reset.ts'
import { sendEmail } from '../_shared/resend.ts'

const schema = z.object({ email: z.email() })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  // Even a malformed request returns the neutral success shape.
  if (!parsed.success) return jsonResponse({ ok: true })

  const email = parsed.data.email.toLowerCase()
  const admin = serviceClient()
  const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(
    /\/$/,
    '',
  )

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${appUrl}/reset-password` },
    })

  // Unknown email (or any generateLink failure): silently succeed, send nothing.
  if (linkError || !linkData?.properties?.action_link) {
    console.log('password reset requested for an address with no account')
    return jsonResponse({ ok: true })
  }

  const { data: church } = await admin
    .from('church_settings')
    .select('name, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCRoster'

  const { subject, html } = passwordResetEmail({
    churchName,
    resetUrl: linkData.properties.action_link,
  })
  const result = await sendEmail({
    to: email,
    subject,
    html,
    fromName: church?.email_from_name ?? churchName,
  })
  await logEmail(admin, { to: email, template: 'password-reset', subject, result })

  return jsonResponse({ ok: true })
})
