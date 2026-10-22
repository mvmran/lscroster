import { z } from 'zod'

/**
 * How long after following a reset link its session may set a password without
 * the current one — the same hour the link itself is valid for (`otp_expiry`).
 */
export const RECOVERY_WINDOW_SECONDS = 60 * 60

const claimsSchema = z.object({
  amr: z.array(z.object({ method: z.string(), timestamp: z.number() })).optional(),
})

/** The payload of a JWT, or null when it can't be read. */
function jwtPayload(token: string): unknown {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)))
  } catch {
    return null
  }
}

/**
 * Whether a session was opened by a password-reset link within the last hour.
 * The access token's `amr` claim records how the session signed in, and keeps
 * it through token refreshes. A reset link signs in with a one-time code
 * (`otp`); nothing else in LSCroster does (invitations end in a password
 * sign-in), so `otp` means the reset link. An ordinary session (`password`)
 * must use Change password, which asks for the current one.
 */
export function isRecentRecovery(
  accessToken: string | null | undefined,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!accessToken) return false
  const claims = claimsSchema.safeParse(jwtPayload(accessToken))
  if (!claims.success) return false
  return (claims.data.amr ?? []).some(
    (entry) =>
      entry.method === 'otp' &&
      nowSeconds - entry.timestamp <= RECOVERY_WINDOW_SECONDS,
  )
}
