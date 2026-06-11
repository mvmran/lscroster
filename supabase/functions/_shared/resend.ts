// Shared Resend sender. All Edge Functions send email through this helper so
// the API key and from-address handling live in one place.

interface SendEmailParams {
  to: string
  subject: string
  html: string
  /** Display name for the From header, e.g. the church name. */
  fromName: string
}

export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: 'not_configured' }
  | { sent: false; reason: 'provider_error'; detail: string }

export async function sendEmail({
  to,
  subject,
  html,
  fromName,
}: SendEmailParams): Promise<SendEmailResult> {
  const emailFrom = Deno.env.get('EMAIL_FROM')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!emailFrom || !resendApiKey) {
    return { sent: false, reason: 'not_configured' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${emailFrom}>`,
      to,
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    console.error('Resend error:', response.status, detail)
    return { sent: false, reason: 'provider_error', detail }
  }

  const { id } = (await response.json()) as { id: string }
  return { sent: true, id }
}
