// Plan-publish notification (issue #17). When a leader publishes a plan, every
// person scheduled on it (who hasn't declined) receives this rich summary:
// service details, all the plan's times, the church name & address, the teams
// and people serving, the order of service, and the songs with key & BPM.

import { esc, footer, wrapper } from './layout.ts'

export interface PlanNotificationParams {
  churchName: string
  churchAddress: string | null
  recipientName: string
  /** e.g. "Sunday 14 June 2026" */
  planDateLong: string
  serviceTypeName: string
  planTitle: string | null
  /** e.g. "10:00am", or null when the service type has no start time */
  startTime: string | null
  /** e.g. "11:45am", or null */
  endTime: string | null
  /** e.g. "1h 45m", or null when nothing is timed */
  durationLabel: string | null
  /** The plan's labelled times (rehearsal, service…), in order. */
  times: { label: string; time: string | null }[]
  /** Who's serving, grouped by team. */
  teams: { name: string; members: { position: string; name: string }[] }[]
  /** The order of service, in order. */
  order: { time: string | null; title: string; isHeader: boolean; detail: string | null }[]
  /** Songs in the plan, with the key/bpm shown to musicians. */
  songs: { title: string; key: string | null; bpm: number | null; meter: string | null }[]
  appUrl: string
}

const sectionHeading = (text: string) => `
  <tr><td style="padding:24px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#71717a;">
    ${esc(text)}
  </td></tr>`

function summaryCard(p: PlanNotificationParams): string {
  const timeLine = [
    p.startTime,
    p.endTime ? `– ${p.endTime}` : null,
    p.durationLabel ? `(${p.durationLabel})` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;border-radius:8px;margin:8px 0 4px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:17px;font-weight:700;color:#18181b;">${esc(p.planDateLong)}</div>
        <div style="font-size:14px;color:#3f3f46;padding-top:4px;">${esc(p.serviceTypeName)}${p.planTitle ? ` — ${esc(p.planTitle)}` : ''}</div>
        ${timeLine ? `<div style="font-size:14px;color:#3f3f46;padding-top:8px;">${esc(timeLine)}</div>` : ''}
        ${
          p.churchAddress
            ? `<div style="font-size:13px;color:#52525b;padding-top:10px;white-space:pre-line;">${esc(p.churchAddress)}</div>`
            : ''
        }
      </td></tr>
    </table>`
}

function timesSection(p: PlanNotificationParams): string {
  if (p.times.length === 0) return ''
  const rows = p.times
    .map(
      (t) =>
        `<div style="font-size:14px;color:#3f3f46;padding:2px 0;"><strong>${esc(t.label)}</strong>${t.time ? ` · ${esc(t.time)}` : ''}</div>`,
    )
    .join('')
  return `${sectionHeading('Times')}<tr><td>${rows}</td></tr>`
}

function teamsSection(p: PlanNotificationParams): string {
  if (p.teams.length === 0) return ''
  const blocks = p.teams
    .map((team) => {
      const members = team.members
        .map(
          (m) =>
            `<div style="font-size:14px;color:#3f3f46;padding:1px 0;">${esc(m.name)} <span style="color:#a1a1aa;">— ${esc(m.position)}</span></div>`,
        )
        .join('')
      return `
        <div style="padding:8px 0 4px;">
          <div style="font-size:13px;font-weight:600;color:#18181b;">${esc(team.name)}</div>
          ${members}
        </div>`
    })
    .join('')
  return `${sectionHeading("Who's serving")}<tr><td>${blocks}</td></tr>`
}

function orderSection(p: PlanNotificationParams): string {
  if (p.order.length === 0) return ''
  const rows = p.order
    .map((item) => {
      if (item.isHeader) {
        return `<div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;padding:10px 0 2px;">${esc(item.title)}</div>`
      }
      return `<div style="font-size:14px;color:#3f3f46;padding:2px 0;">
        <span style="display:inline-block;min-width:52px;color:#a1a1aa;">${item.time ? esc(item.time) : ''}</span>
        ${esc(item.title)}${item.detail ? ` <span style="color:#a1a1aa;">— ${esc(item.detail)}</span>` : ''}
      </div>`
    })
    .join('')
  return `${sectionHeading('Order of service')}<tr><td>${rows}</td></tr>`
}

function songsSection(p: PlanNotificationParams): string {
  if (p.songs.length === 0) return ''
  const rows = p.songs
    .map((s) => {
      const meta = [
        s.key ? `Key ${esc(s.key)}` : null,
        s.bpm ? `${s.bpm} BPM` : null,
        s.meter ? esc(s.meter) : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return `<div style="font-size:14px;color:#3f3f46;padding:2px 0;">${esc(s.title)}${meta ? ` <span style="color:#a1a1aa;">— ${meta}</span>` : ''}</div>`
    })
    .join('')
  return `${sectionHeading('Songs')}<tr><td>${rows}</td></tr>`
}

export function planNotificationEmail(
  p: PlanNotificationParams,
): { subject: string; html: string } {
  return {
    subject: `Plan published: ${p.serviceTypeName} · ${p.planDateLong}`,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:8px;">
          ${esc(p.churchName)}
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          Hi ${esc(p.recipientName)},
          <br /><br />
          The plan for this service has been published. Here's everything you
          need:
        </td>
      </tr>
      <tr><td>${summaryCard(p)}</td></tr>
      ${timesSection(p)}
      ${teamsSection(p)}
      ${orderSection(p)}
      ${songsSection(p)}
      <tr>
        <td align="center" style="padding:28px 0 8px;">
          <a href="${p.appUrl}/my-schedule"
             style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">
            View my schedule
          </a>
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}
