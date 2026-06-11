interface InvitationEmailParams {
  churchName: string
  recipientName: string
  inviteUrl: string
  expiresInDays: number
}

export function invitationEmail({
  churchName,
  recipientName,
  inviteUrl,
  expiresInDays,
}: InvitationEmailParams): { subject: string; html: string } {
  return {
    subject: `You're invited to ${churchName} on LSCRoster`,
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
                You've been invited to join <strong>${churchName}</strong> on
                LSCRoster — the app we use to plan services and rosters.
                Tap the button below to set your password and get started.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 0;">
                <a href="${inviteUrl}"
                   style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">
                  Accept invitation
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#71717a;">
                This link expires in ${expiresInDays} days. If the button
                doesn't work, copy and paste this address into your browser:
                <br />
                <a href="${inviteUrl}" style="color:#3f3f46;word-break:break-all;">${inviteUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;font-size:12px;color:#a1a1aa;">
                Sent by LSCRoster on behalf of ${churchName}. If you weren't
                expecting this invitation you can safely ignore it.
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
