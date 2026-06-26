// "Upcoming roster status" digest (issue #117): a per-recipient table of
// rostering progress for upcoming services, with RAG-coloured counts and a pie
// chart of the totals. Sent to Team Leaders, Team Viewers and admins; the table
// is scoped to the teams the recipient governs (admins see every team).

import { esc, footer, wrapper } from './layout.ts'

export interface RosterStatusRow {
  /** Service date, 'yyyy-mm-dd'. */
  date: string
  /** Whole days from today to the service (for the unconfirmed RAG threshold). */
  daysUntil: number
  unassigned: number
  unsent: number
  unconfirmed: number
  declined: number
  confirmed: number
}

export interface RosterStatusEmailParams {
  churchName: string
  recipientName: string
  onBehalfOf: string | null
  weeks: number
  rows: RosterStatusRow[]
  appUrl: string
}

// RAG palette (foreground colours for the numbers).
const BLACK = '#18181b'
const RED = '#dc2626'
const AMBER = '#d97706'
const GREEN = '#16a34a'
const MUTED = '#a1a1aa' // zero values, to keep the grid readable

// Pie segment fills (slightly softer than the table foregrounds).
const PIE_COLORS = ['#9ca3af', '#64748b', '#f59e0b', '#dc2626', '#16a34a']
const CATEGORY_LABELS = [
  'Unassigned',
  'Unsent',
  'Unconfirmed',
  'Declined',
  'Confirmed',
]

/** 'yyyy-mm-dd' -> 'Sun 14 Jun'. */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`))
}

/** A colour-coded number cell. Zeros render muted regardless of category. */
function numCell(value: number, color: string): string {
  const c = value === 0 ? MUTED : color
  return `<td style="padding:7px 10px;text-align:center;font-size:14px;font-weight:600;color:${c};border-top:1px solid #f1f1f3;white-space:nowrap;">${value}</td>`
}

/** A QuickChart pie image URL for the category totals (renders in every email
 * client, unlike inline SVG). Only aggregate counts travel in the URL — no
 * personal data. */
function pieUrl(totals: number[]): string {
  const config = {
    type: 'pie',
    data: {
      labels: CATEGORY_LABELS,
      datasets: [{ data: totals, backgroundColor: PIE_COLORS }],
    },
    options: {
      plugins: { legend: { position: 'right' } },
      legend: { position: 'right' },
    },
  }
  const c = encodeURIComponent(JSON.stringify(config))
  return `https://quickchart.io/chart?w=420&h=240&bkg=white&v=2&c=${c}`
}

export function rosterStatusEmail(params: RosterStatusEmailParams): {
  subject: string
  html: string
} {
  const { churchName, recipientName, weeks, rows, appUrl } = params

  const totals = rows.reduce(
    (acc, r) => {
      acc[0] += r.unassigned
      acc[1] += r.unsent
      acc[2] += r.unconfirmed
      acc[3] += r.declined
      acc[4] += r.confirmed
      return acc
    },
    [0, 0, 0, 0, 0],
  )

  const headerCell = (label: string) =>
    `<th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:0.03em;border-bottom:2px solid #e4e4e7;white-space:nowrap;">${label}</th>`

  const bodyRows = rows
    .map(
      (r) => `<tr>
        <td style="padding:7px 10px;font-size:13px;color:#18181b;border-top:1px solid #f1f1f3;white-space:nowrap;">${shortDate(r.date)}</td>
        ${numCell(r.unassigned, BLACK)}
        ${numCell(r.unsent, BLACK)}
        ${numCell(r.unconfirmed, r.daysUntil <= 7 ? RED : AMBER)}
        ${numCell(r.declined, RED)}
        ${numCell(r.confirmed, GREEN)}
      </tr>`,
    )
    .join('')

  const weeksLabel = weeks === 1 ? 'week' : 'weeks'

  const inner = `
  <tr>
    <td style="padding-bottom:8px;font-size:20px;font-weight:700;color:#18181b;">
      Upcoming roster status
    </td>
  </tr>
  <tr>
    <td style="padding-bottom:20px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Hi ${esc(recipientName)}, here's where rostering stands for the next
      ${weeks} ${weeksLabel}${params.onBehalfOf ? '' : ''}. Counts cover the teams you oversee.
    </td>
  </tr>
  <tr>
    <td align="center" style="padding-bottom:20px;">
      <img src="${pieUrl(totals)}" width="420" alt="Roster status totals" style="max-width:100%;height:auto;border:0;" />
    </td>
  </tr>
  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            ${headerCell('Date')}
            ${headerCell('Unassigned')}
            ${headerCell('Unsent')}
            ${headerCell('Unconfirmed')}
            ${headerCell('Declined')}
            ${headerCell('Confirmed')}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding-top:20px;">
      <a href="${appUrl}/services/matrix" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Open the matrix</a>
    </td>
  </tr>
  <tr>
    <td style="padding-top:16px;font-size:12px;line-height:1.6;color:#71717a;">
      <strong>Unconfirmed</strong> turns red within 7 days of the service.
      Manage which emails you get from your profile.
    </td>
  </tr>
  ${footer(churchName)}`

  return {
    subject: `Upcoming roster status — next ${weeks} ${weeksLabel}`,
    html: wrapper(inner),
  }
}
