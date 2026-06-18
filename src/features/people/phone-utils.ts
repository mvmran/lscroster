// Phone validation + display formatting (issue #42).
//
// Two accepted shapes:
//   • Australian mobile, entered without a country code: 10 digits starting
//     "04", displayed as "04nn nnn nnn" (groups of 4-3-3).
//   • International, entered with a leading "+": "+cc nnn nnn nnn", the country
//     code kept as typed and the national part grouped in 3s (a lone trailing
//     digit is merged into the previous group to make a 4).
//
// CSV imports and older records may hold unformatted numbers, so the display
// helpers always re-format whatever is stored rather than trusting it.

/** Digits only, preserving a leading "+" for international numbers. */
function normalise(raw: string): { plus: boolean; digits: string } {
  const trimmed = raw.trim()
  return { plus: trimmed.startsWith('+'), digits: trimmed.replace(/\D/g, '') }
}

/** Group a national number string in 3s; merge a trailing single into a 4. */
function groupInThrees(s: string): string {
  const groups: string[] = []
  for (let i = 0; i < s.length; i += 3) groups.push(s.slice(i, i + 3))
  if (groups.length >= 2 && groups[groups.length - 1].length === 1) {
    groups[groups.length - 2] += groups.pop()
  }
  return groups.join(' ')
}

// Country codes that are a single digit (NANP + Russia/Kazakhstan). Everything
// else we treat as a 2-digit code, which covers Australia (+61) and most of the
// church's realistic international contacts; exotic 3-digit codes still display
// readably, just with the split one digit off.
const ONE_DIGIT_CC = new Set(['1', '7'])

function splitCountryCode(digits: string): { cc: string; rest: string } {
  const len = ONE_DIGIT_CC.has(digits[0]) ? 1 : 2
  return { cc: digits.slice(0, len), rest: digits.slice(len) }
}

/**
 * Format a phone number for display/storage. Returns the input trimmed and
 * unchanged when it doesn't match a shape we know how to format, so nothing is
 * ever silently dropped.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const { plus, digits } = normalise(raw)
  if (digits === '') return raw.trim()

  if (plus) {
    const { cc, rest } = splitCountryCode(digits)
    return rest ? `+${cc} ${groupInThrees(rest)}` : `+${cc}`
  }

  // National Australian mobile: 0 4 + 8 more digits.
  if (/^04\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`
  }

  return raw.trim()
}

/**
 * Validate a phone number. Empty is allowed (the field is optional). Otherwise
 * it must be an Australian mobile (04xxxxxxxx) or an international number with a
 * "+" prefix and 8–15 digits (E.164's upper bound).
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  if (!raw || raw.trim() === '') return true
  const { plus, digits } = normalise(raw)
  if (plus) return digits.length >= 8 && digits.length <= 15
  return /^04\d{8}$/.test(digits)
}

export const PHONE_ERROR =
  'Enter an Australian mobile (04xx xxx xxx) or an international number (+…).'
