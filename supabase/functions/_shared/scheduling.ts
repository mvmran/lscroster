// Shared helpers for the scheduling email flow: response tokens (raw token in
// the email, sha-256 hash in the database) and church-timezone date handling.

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 'yyyy-mm-dd' -> 'Sunday 14 June 2026'. Plan dates are wall dates. */
export function formatPlanDateLong(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

/** 'HH:MM:SS' (time column) -> '10:00am', or null. */
export function formatStartTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${m.toString().padStart(2, '0')}${suffix}`
}

/** Today's calendar date ('yyyy-mm-dd') in the church's timezone. */
export function todayInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Current hour (0–23) in the church's timezone. */
export function hourInTimezone(timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  )
}

/** Adds whole days to a 'yyyy-mm-dd' wall date. */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
}
