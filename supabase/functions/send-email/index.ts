// Sends outbound email via Resend. All app email goes through Edge Functions;
// the Resend API key never reaches the browser. Requires an authenticated
// caller with the admin or leader role.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { testEmail } from '../_shared/email-templates/test-email.ts'
import { sendEmail } from '../_shared/resend.ts'

const sendEmailSchema = z.object({
  to: z.email(),
  template: z.literal('test'),
  data: z.record(z.string(), z.unknown()).optional(),
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
  if (!['admin', 'leader'].includes(caller.role)) {
    return jsonResponse({ error: 'Not allowed to send email' }, 403)
  }

  const parsed = sendEmailSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Invalid request', details: z.flattenError(parsed.error).fieldErrors },
      400,
    )
  }
  const { to, template } = parsed.data

  const { data: church } = await admin
    .from('church_settings')
    .select('name, email_from_name')
    .maybeSingle()
  const churchName = church?.name ?? 'LSCroster'

  let subject: string
  let html: string
  switch (template) {
    case 'test': {
      ;({ subject, html } = testEmail({
        churchName,
        recipientName: caller.first_name,
      }))
      break
    }
  }

  const result = await sendEmail({
    to,
    subject,
    html,
    fromName: church?.email_from_name ?? churchName,
  })
  if (!result.sent) {
    return jsonResponse(
      {
        error:
          result.reason === 'not_configured'
            ? 'Email is not configured (RESEND_API_KEY / EMAIL_FROM secrets missing)'
            : 'Email provider rejected the request',
      },
      result.reason === 'not_configured' ? 500 : 502,
    )
  }
  return jsonResponse({ ok: true, id: result.id })
})
