import { esc, footer, wrapper } from './layout.ts'

interface PasswordResetEmailParams {
  churchName: string
  /** The Supabase recovery action link (already a trusted, signed URL). */
  resetUrl: string
}

export function passwordResetEmail({
  churchName,
  resetUrl,
}: PasswordResetEmailParams): { subject: string; html: string } {
  const name = esc(churchName)
  return {
    subject: `Reset your ${churchName} password`,
    html: wrapper(`
      <tr>
        <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
          ${name}
        </td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;color:#3f3f46;">
          We received a request to reset the password for your ${name} account
          on LSCRoster. Tap the button below to choose a new password.
          This link expires in 1 hour.
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:28px 0;">
          <a href="${resetUrl}"
             style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">
            Reset password
          </a>
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.6;color:#71717a;">
          If the button doesn't work, copy and paste this address into your browser:
          <br />
          <a href="${resetUrl}" style="color:#3f3f46;word-break:break-all;">${resetUrl}</a>
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.6;color:#71717a;padding-top:12px;">
          If you didn't request this, you can safely ignore this email —
          your password won't change.
        </td>
      </tr>
      ${footer(name)}
    `),
  }
}
