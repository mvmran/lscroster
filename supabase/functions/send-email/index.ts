// Sends outbound email via Resend. All app email goes through this function;
// the Resend API key never reaches the browser. Requires an authenticated
// caller with the admin or leader role.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { testEmail } from '../_shared/email-templates/test-email.ts'

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401)
  }

  // Identify the caller from their JWT, then check their role.
  const userClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  )
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401)
  }

  const admin = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { data: person } = await admin
    .from('people')
    .select('role, first_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!person || !['admin', 'leader'].includes(person.role)) {
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
  const churchName = church?.name ?? 'LSCRoster'

  let subject: string
  let html: string
  switch (template) {
    case 'test': {
      ;({ subject, html } = testEmail({
        churchName,
        recipientName: person.first_name,
      }))
      break
    }
  }

  const emailFrom = Deno.env.get('EMAIL_FROM')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!emailFrom || !resendApiKey) {
    return jsonResponse(
      { error: 'Email is not configured (RESEND_API_KEY / EMAIL_FROM secrets missing)' },
      500,
    )
  }
  const fromName = church?.email_from_name ?? churchName
  const from = `${fromName} <${emailFrom}>`

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!resendResponse.ok) {
    const detail = await resendResponse.text()
    console.error('Resend error:', resendResponse.status, detail)
    return jsonResponse({ error: 'Email provider rejected the request' }, 502)
  }

  const { id } = (await resendResponse.json()) as { id: string }
  return jsonResponse({ ok: true, id })
})
