// Shared HTML email chrome: the outer responsive card wrapper and the footer.
// Every LSCroster template renders its body inside `wrapper(...)` so the look
// stays consistent across requests, reminders, cancellations and plan notices.

export const wrapper = (inner: string) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;padding:32px;">
            ${inner}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

export const footer = (churchName: string) => `
  <tr>
    <td style="padding-top:24px;font-size:12px;color:#a1a1aa;">
      Sent by LSCroster on behalf of ${churchName}.
    </td>
  </tr>`

/**
 * A small "on behalf of …" banner, shown when a scheduling email is routed to a
 * managing member for a person without their own email address (issue #89). It
 * names whose request this is and reminds the manager to respect that person's
 * privacy. Returns '' when not acting on anyone's behalf.
 */
export const onBehalfBanner = (onBehalfOf: string | null | undefined) =>
  onBehalfOf
    ? `<tr><td style="padding:0 0 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2ff;border-radius:8px;">
          <tr><td style="padding:12px 16px;font-size:13px;line-height:1.5;color:#3730a3;">
            You're receiving this on behalf of <strong>${esc(onBehalfOf)}</strong>, whose account you manage.
            Please respect their privacy and only share it with them.
          </td></tr>
        </table>
      </td></tr>`
    : ''

/** Escapes user-supplied text before interpolating it into email HTML. */
export function esc(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
