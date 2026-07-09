// Worship set-list email (issue #133). Sent when a plan is published (or on
// demand from the plan page) to the admin-curated distribution list, with the
// polished set-list PDF attached. The body is a glanceable summary — the PDF
// carries the full detail (roster, links, flow notes).

import { esc, footer, onBehalfBanner, wrapper } from './layout.ts'

export interface SetlistEmailParams {
  churchName: string
  churchAddress: string | null
  recipientName: string
  /** Set when routed to a managing member for a managed person (issue #89). */
  onBehalfOf?: string | null
  /** e.g. "Sunday 12 October 2025" */
  planDateLong: string
  serviceTypeName: string
  planTitle: string | null
  /** The plan's labelled times (practice, service…), in order. */
  times: { label: string; time: string | null }[]
  songs: {
    title: string
    key: string | null
    bpm: number | null
    meter: string | null
    referenceUrl: string | null
  }[]
  planId: string
  appUrl: string
}

const sectionHeading = (text: string) => `
  <tr><td style="padding:24px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#71717a;">
    ${esc(text)}
  </td></tr>`

function summaryCard(p: SetlistEmailParams): string {
  const timesLine = p.times
    .map((t) => `${t.label}${t.time ? ` ${t.time}` : ''}`.trim())
    .join(' · ')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;border-radius:8px;margin:8px 0 4px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:17px;font-weight:700;color:#18181b;">${esc(p.planDateLong)}</div>
        <div style="font-size:14px;color:#3f3f46;padding-top:4px;">${esc(p.serviceTypeName)}${p.planTitle ? ` — ${esc(p.planTitle)}` : ''}</div>
        ${timesLine ? `<div style="font-size:14px;color:#3f3f46;padding-top:8px;">${esc(timesLine)}</div>` : ''}
        ${
          p.churchAddress
            ? `<div style="font-size:13px;color:#52525b;padding-top:10px;white-space:pre-line;">${esc(p.churchAddress)}</div>`
            : ''
        }
      </td></tr>
    </table>`
}

function songsSection(p: SetlistEmailParams): string {
  if (p.songs.length === 0) return ''
  const rows = p.songs
    .map((s, i) => {
      const meta = [
        s.key ? `Key ${esc(s.key)}` : null,
        s.bpm ? `${s.bpm} BPM` : null,
        s.meter ? esc(s.meter) : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const listen = s.referenceUrl
        ? ` <a href="${esc(s.referenceUrl)}" style="color:#2563eb;text-decoration:none;">Listen ›</a>`
        : ''
      return `<div style="font-size:14px;color:#3f3f46;padding:3px 0;">
        <span style="display:inline-block;min-width:20px;color:#a1a1aa;">${i + 1}.</span>
        ${esc(s.title)}${meta ? ` <span style="color:#a1a1aa;">— ${meta}</span>` : ''}${listen}
      </div>`
    })
    .join('')
  return `${sectionHeading('Song list')}<tr><td>${rows}</td></tr>`
}

export function setlistEmail(p: SetlistEmailParams): { subject: string; html: string } {
  return {
    subject: `Worship set list: ${p.serviceTypeName} · ${p.planDateLong}`,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:8px;">
          ${esc(p.churchName)}
        </td>
      </tr>
      ${onBehalfBanner(p.onBehalfOf)}
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          Hi ${esc(p.recipientName)},
          <br /><br />
          Here's the worship set for this service. The full set list — keys,
          reference links, flow and notes — is attached as a PDF.
        </td>
      </tr>
      <tr><td>${summaryCard(p)}</td></tr>
      ${songsSection(p)}
      <tr>
        <td align="center" style="padding:28px 0 8px;">
          <a href="${p.appUrl}/services/plans/${p.planId}"
             style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">
            View the plan
          </a>
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}
