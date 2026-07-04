/**
 * Canonical red/amber/green status class strings. These are semantic colours
 * (confirmed/warning/problem), deliberately independent of the brand accent —
 * keep them Tailwind-palette-based so they read the same in light and dark.
 */
export type StatusTone = 'success' | 'warning' | 'danger'

/** Soft filled badges/chips — the at-a-glance colour coding on plans. */
export const STATUS_SOFT: Record<StatusTone, string> = {
  success: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  danger: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
}

/** Outline badges — validation results and quieter status markers. */
export const STATUS_OUTLINE: Record<StatusTone, string> = {
  success: 'border-green-500/50 text-green-700 dark:text-green-400',
  warning: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  danger: 'border-red-500/50 text-red-700 dark:text-red-400',
}
