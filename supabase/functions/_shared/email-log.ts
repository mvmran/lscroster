// Append a row to email_log for every outbound email attempt, so delivery
// problems can be diagnosed from Settings instead of provider dashboards.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { SendEmailResult } from './resend.ts'

interface LogEmailParams {
  to: string
  template: string
  subject: string
  result: SendEmailResult
  personId?: string | null
  planId?: string | null
}

export async function logEmail(
  admin: SupabaseClient,
  { to, template, subject, result, personId, planId }: LogEmailParams,
): Promise<void> {
  const { error } = await admin.from('email_log').insert({
    to_email: to,
    template,
    subject,
    status: result.sent ? 'sent' : 'error',
    error: result.sent
      ? null
      : result.reason === 'provider_error'
        ? result.detail.slice(0, 500)
        : 'email not configured',
    person_id: personId ?? null,
    plan_id: planId ?? null,
  })
  if (error) console.error('email_log insert failed:', error)
}
