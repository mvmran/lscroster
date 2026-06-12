// Scheduling emails: the initial request (Accept/Decline), the nudge for
// unanswered requests, and the reminder for confirmed people.

interface SchedulingDetails {
  churchName: string
  recipientName: string
  /** e.g. "Sunday 14 June 2026" */
  planDateLong: string
  /** e.g. "10:00am", or null when the service type has no start time */
  startTime: string | null
  serviceTypeName: string
  planTitle: string | null
  teamName: string
  positionName: string
}

interface RequestEmailParams extends SchedulingDetails {
  respondUrl: string
  isNudge: boolean
}

const wrapper = (inner: string) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;padding:32px;">
            ${inner}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

const detailsBlock = (d: SchedulingDetails) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;border-radius:8px;margin:20px 0;">
    <tr><td style="padding:16px 20px;">
      <div style="font-size:16px;font-weight:700;color:#18181b;">${d.planDateLong}${d.startTime ? ` · ${d.startTime}` : ''}</div>
      <div style="font-size:14px;color:#3f3f46;padding-top:4px;">${d.serviceTypeName}${d.planTitle ? ` — ${d.planTitle}` : ''}</div>
      <div style="font-size:14px;color:#3f3f46;padding-top:8px;"><strong>${d.positionName}</strong> · ${d.teamName}</div>
    </td></tr>
  </table>`

const footer = (churchName: string) => `
  <tr>
    <td style="padding-top:24px;font-size:12px;color:#a1a1aa;">
      Sent by LSCRoster on behalf of ${churchName}.
    </td>
  </tr>`

export function schedulingRequestEmail(
  p: RequestEmailParams,
): { subject: string; html: string } {
  const subject = p.isNudge
    ? `Reminder: can you serve on ${p.planDateLong}?`
    : `Can you serve on ${p.planDateLong}?`
  const intro = p.isNudge
    ? `Just checking in — ${p.churchName} is still waiting to hear if you can serve:`
    : `${p.churchName} would like to schedule you to serve:`
  return {
    subject,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
          ${p.churchName}
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          Hi ${p.recipientName},
          <br /><br />
          ${intro}
          ${detailsBlock(p)}
          Can you make it? No login needed — just tap a button.
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:28px 0 8px;">
          <a href="${p.respondUrl}?action=accept"
             style="display:inline-block;background-color:#16a34a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 32px;border-radius:8px;margin:0 6px;">
            Accept
          </a>
          <a href="${p.respondUrl}?action=decline"
             style="display:inline-block;background-color:#dc2626;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 32px;border-radius:8px;margin:0 6px;">
            Decline
          </a>
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.6;color:#71717a;padding-top:16px;">
          If the buttons don't work, copy this address into your browser:
          <br />
          <a href="${p.respondUrl}" style="color:#3f3f46;word-break:break-all;">${p.respondUrl}</a>
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}

interface ReminderEmailParams extends SchedulingDetails {
  appUrl: string
}

export function schedulingReminderEmail(
  p: ReminderEmailParams,
): { subject: string; html: string } {
  return {
    subject: `You're serving on ${p.planDateLong}`,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
          ${p.churchName}
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          Hi ${p.recipientName},
          <br /><br />
          A quick reminder that you're confirmed to serve:
          ${detailsBlock(p)}
          See you there! You can view the full plan in LSCRoster.
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:24px 0 8px;">
          <a href="${p.appUrl}/my-schedule"
             style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">
            View my schedule
          </a>
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}
