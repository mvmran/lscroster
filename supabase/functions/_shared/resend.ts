// Shared Resend sender. All Edge Functions send email through this helper so
// the API key, from-address handling and rate limiting live in one place.
//
// Resend throttles the email API at 2 requests/second (issue #18). Every
// outbound call therefore passes through `rateLimit`, which spaces successive
// requests apart. Bulk sends use the Batch API (`sendEmailBatch`, up to 100
// emails per HTTP call) so a roster email-out is one or two rate-limited calls
// instead of dozens.

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

// Resend allows 2 requests/second. Space successive calls ~550ms apart (a touch
// over the 500ms floor for headroom) so we never trip the limit, even when a
// few function invocations share a warm isolate. Slots are reserved
// synchronously, so concurrent callers each wait for a distinct turn.
const MIN_INTERVAL_MS = 550
let nextSlotAt = 0

async function rateLimit(): Promise<void> {
  const now = Date.now()
  const startAt = Math.max(now, nextSlotAt)
  nextSlotAt = startAt + MIN_INTERVAL_MS
  const wait = startAt - now
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

function credentials(): { emailFrom: string; apiKey: string } | null {
  const emailFrom = Deno.env.get('EMAIL_FROM')
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!emailFrom || !apiKey) return null
  return { emailFrom, apiKey }
}

export async function sendEmail({
  to,
  subject,
  html,
  fromName,
}: SendEmailParams): Promise<SendEmailResult> {
  const creds = credentials()
  if (!creds) return { sent: false, reason: 'not_configured' }

  await rateLimit()
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${creds.emailFrom}>`,
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

/** Resend's Batch API accepts at most 100 emails per request. */
const BATCH_LIMIT = 100

/**
 * Send many emails through Resend's Batch API (issue #18): up to 100 per HTTP
 * call, each call rate-limited like a single send. Returns one result per input
 * item, in the same order, so callers can log each attempt individually.
 */
export async function sendEmailBatch(
  items: SendEmailParams[],
): Promise<SendEmailResult[]> {
  if (items.length === 0) return []
  const creds = credentials()
  if (!creds) return items.map(() => ({ sent: false, reason: 'not_configured' }))

  const results: SendEmailResult[] = []
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT)
    await rateLimit()
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        chunk.map((item) => ({
          from: `${item.fromName} <${creds.emailFrom}>`,
          to: item.to,
          subject: item.subject,
          html: item.html,
        })),
      ),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('Resend batch error:', response.status, detail)
      for (const _item of chunk) {
        results.push({ sent: false, reason: 'provider_error', detail })
      }
      continue
    }

    // Resend returns { data: [{ id }, ...] } aligned with the request order.
    const body = (await response.json()) as { data?: { id: string }[] }
    const ids = body.data ?? []
    chunk.forEach((_item, idx) => {
      const id = ids[idx]?.id
      results.push(
        id
          ? { sent: true, id }
          : {
              sent: false,
              reason: 'provider_error',
              detail: 'missing id in batch response',
            },
      )
    })
  }
  return results
}
