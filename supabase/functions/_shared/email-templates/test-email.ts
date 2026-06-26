interface TestEmailParams {
  churchName: string
  recipientName: string
}

export function testEmail({ churchName, recipientName }: TestEmailParams): {
  subject: string
  html: string
} {
  return {
    subject: `${churchName} — test email from LSCroster`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
                ${churchName}
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
                Hi ${recipientName},
                <br /><br />
                This is a test email from your LSCroster instance. If you are
                reading this, outbound email via Resend is working correctly. 🎉
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;font-size:12px;color:#a1a1aa;">
                Sent by LSCroster on behalf of ${churchName}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  }
}
