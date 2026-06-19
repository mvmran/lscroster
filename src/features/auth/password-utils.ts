import { z } from 'zod'

/**
 * Shared password rules (issue #60), enforced wherever a member chooses a
 * password: the setup wizard, invitation acceptance, and password reset.
 *   1. at least 8 characters
 *   2. at least one upper- and one lower-case letter
 *   3. not a commonly-used password
 * Supabase Auth's own policy is the server-side backstop; this keeps the rules
 * consistent and the messages friendly across every form.
 */

// A small blocklist of the most common passwords. Lower-cased; the check is
// case-insensitive so "Password1" is caught as readily as "password1".
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'welcome1',
  'welcome123',
  'admin123',
  'letmein1',
  'abc12345',
  'changeme',
  'football1',
  'sunshine1',
  'princess1',
])

export function isCommonPassword(value: string): boolean {
  return COMMON_PASSWORDS.has(value.trim().toLowerCase())
}

/** Plain-English summary of the rules, shown under password fields. */
export const PASSWORD_HINT =
  'At least 8 characters, with upper- and lower-case letters.'

export const passwordField = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters' })
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), {
    error: 'Use both upper- and lower-case letters',
  })
  .refine((v) => !isCommonPassword(v), {
    error: 'That password is too common — choose something less guessable',
  })

/** `{ password, confirm }` with the matching-confirmation refinement. */
export const passwordWithConfirm = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    error: 'Passwords do not match',
    path: ['confirm'],
  })
