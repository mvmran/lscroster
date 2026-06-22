// Account-access notices (issues #91 and #92): a person is told when their
// sign-in access is revoked (account archived, or their email removed) or when
// it is reinstated (account reactivated). Routed to the person's own address.

import { esc, footer, wrapper } from './layout.ts'

interface AccessEmailParams {
  churchName: string
  recipientName: string
}

/** Sent when a person's sign-in access is revoked (archived or email removed). */
export function accessRevokedEmail(
  p: AccessEmailParams,
): { subject: string; html: string } {
  return {
    subject: `Your ${p.churchName} sign-in access has been revoked`,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
          ${esc(p.churchName)}
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          Hi ${esc(p.recipientName)},
          <br /><br />
          Your sign-in access to ${esc(p.churchName)}'s roster has been revoked,
          so you can no longer log in.
          <br /><br />
          If you think this is a mistake, please contact ${esc(p.churchName)}.
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}

/** Sent when a person's sign-in access is reinstated (reactivated). */
export function accessReinstatedEmail(
  p: AccessEmailParams,
): { subject: string; html: string } {
  return {
    subject: `Your ${p.churchName} sign-in access has been reinstated`,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
          ${esc(p.churchName)}
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          Hi ${esc(p.recipientName)},
          <br /><br />
          Good news — your sign-in access to ${esc(p.churchName)}'s roster has
          been reinstated. You can log in again with your usual email and
          password.
        </td>
      </tr>
      ${footer(p.churchName)}`),
  }
}
