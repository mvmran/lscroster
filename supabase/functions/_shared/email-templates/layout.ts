// Shared HTML email chrome: the outer responsive card wrapper and the footer.
// Every LSCRoster template renders its body inside `wrapper(...)` so the look
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
      Sent by LSCRoster on behalf of ${churchName}.
    </td>
  </tr>`

/** Escapes user-supplied text before interpolating it into email HTML. */
export function esc(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
