// Worship set-list email (issue #133). Sent when a plan is published (or on
// demand from the plan page) to the admin-curated distribution list. The body
// *is* the set list — a bordered grid mirroring the worship team's
// long-standing hand-made template: service information (with the worship
// teams' roster), practice information, the song list (link / key / info /
// BPM) and the plan's notes — plus a link to download the lyrics sheet PDF
// from the app (attachments can't go through Resend's Batch API).

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
  /** The plan title, shown as "Theme / References". */
  planTitle: string | null
  /** Worship-type teams' rosters: team name → "Ana (Keys) / Ben (Drums)". */
  serving: { team: string; members: string }[]
  /** The plan's labelled times (practice, service…), in order. */
  times: { label: string; time: string | null }[]
  songs: {
    title: string
    /** The item's flow/dynamics note, shown under the title. */
    detail: string | null
    referenceUrl: string | null
    key: string | null
    meter: string | null
    bpm: number | null
  }[]
  /** The plan's notes, verbatim. */
  notes: string | null
  planId: string
  appUrl: string
}

// The grid look of the original Word template: hairline borders, grey section
// bands. Colours stay email-safe inline.
const BORDER = 'border:1px solid #d4d4d8;'
const CELL = `${BORDER}padding:7px 10px;font-size:13px;color:#3f3f46;vertical-align:top;`
const LABEL_CELL = `${CELL}background-color:#fafafa;font-weight:700;color:#18181b;white-space:nowrap;`

const sectionRow = (title: string, span: number) => `
  <tr><td colspan="${span}" style="${BORDER}background-color:#d9d9d9;padding:6px 10px;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#18181b;">
    ${esc(title.toUpperCase())}
  </td></tr>`

const labelValueRow = (label: string, value: string, span: number) => `
  <tr>
    <td style="${LABEL_CELL}">${esc(label)}</td>
    <td colspan="${span - 1}" style="${CELL}white-space:pre-line;">${esc(value)}</td>
  </tr>`

/** The whole set list as one bordered grid, like the original template. */
function grid(p: SetlistEmailParams): string {
  // The song list is the widest section: title + link + key + info + bpm.
  const SPAN = 5

  const serviceRows = [
    labelValueRow('Date of Service', p.planDateLong, SPAN),
    labelValueRow('Service Type', p.serviceTypeName, SPAN),
    ...p.serving.map((s) => labelValueRow(s.team, s.members, SPAN)),
    ...(p.planTitle ? [labelValueRow('Theme / References', p.planTitle, SPAN)] : []),
  ].join('')

  const practiceRows = [
    ...p.times.map((t) => labelValueRow(t.label, t.time ?? '', SPAN)),
    ...(p.churchAddress ? [labelValueRow('Address', p.churchAddress, SPAN)] : []),
  ].join('')

  const songHeader = `
    <tr>
      ${['Name', 'Link', 'Key', 'Info', 'BPM']
        .map(
          (h) =>
            `<td style="${BORDER}background-color:#f4f4f5;padding:6px 10px;font-size:12px;font-weight:700;color:#18181b;">${h}</td>`,
        )
        .join('')}
    </tr>`
  const songRows = p.songs
    .map((s) => {
      const name = `${esc(s.title)}${
        s.detail
          ? `<div style="font-size:12px;color:#71717a;padding-top:2px;">${esc(s.detail)}</div>`
          : ''
      }`
      const link = s.referenceUrl
        ? `<a href="${esc(s.referenceUrl)}" style="color:#2563eb;text-decoration:none;">Listen&nbsp;›</a>`
        : ''
      return `
        <tr>
          <td style="${CELL}">${name}</td>
          <td style="${CELL}">${link}</td>
          <td style="${CELL}text-align:center;">${esc(s.key ?? '')}</td>
          <td style="${CELL}text-align:center;">${esc(s.meter ?? '')}</td>
          <td style="${CELL}text-align:center;">${s.bpm ?? ''}</td>
        </tr>`
    })
    .join('')

  const notesRows = p.notes?.trim()
    ? `${sectionRow('Notes', SPAN)}
       <tr><td colspan="${SPAN}" style="${CELL}white-space:pre-line;">${esc(p.notes.trim())}</td></tr>`
    : ''

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 4px;">
      <tr><td colspan="${SPAN}" style="${BORDER}padding:10px;text-align:center;font-size:14px;font-weight:700;letter-spacing:0.04em;color:#18181b;">
        ${esc(p.churchName.toUpperCase())} — WORSHIP SET LIST
      </td></tr>
      ${sectionRow('Service Information', SPAN)}
      ${serviceRows}
      ${practiceRows ? `${sectionRow('Practice Information', SPAN)}${practiceRows}` : ''}
      ${p.songs.length > 0 ? `${sectionRow('Song List', SPAN)}${songHeader}${songRows}` : ''}
      ${notesRows}
    </table>`
}

export function setlistEmail(p: SetlistEmailParams): { subject: string; html: string } {
  const planUrl = `${p.appUrl}/services/plans/${p.planId}`
  return {
    subject: `[${p.churchName}] Worship Set — ${p.planDateLong}${
      p.planTitle ? ` — ${p.planTitle}` : ''
    }`,
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
          Here's the worship set for ${esc(p.planDateLong)} — the key, links
          and flow for the songs we'll sing, and who's serving.
        </td>
      </tr>
      <tr><td>${grid(p)}</td></tr>
      <tr>
        <td align="center" style="padding:24px 0 4px;">
          <a href="${planUrl}?lyrics=download"
             style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">
            Download lyrics sheet (PDF)
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:4px 0 8px;font-size:13px;">
          <a href="${planUrl}" style="color:#2563eb;text-decoration:none;">View the plan online</a>
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}
