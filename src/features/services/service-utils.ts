import { addSeconds, format, parseISO } from 'date-fns'
import type { Enums, Tables } from '@/types/database'

export type Plan = Tables<'plans'>
export type PlanItem = Tables<'plan_items'>
export type ServiceType = Tables<'service_types'>
export type Song = Tables<'songs'>
export type PlanItemKind = Enums<'plan_item_kind'>

export const PLAN_ITEM_KIND_LABELS: Record<PlanItemKind, string> = {
  header: 'Header',
  song: 'Song',
  item: 'Item',
}

/** Default lengths when adding a new item, in seconds. */
export const DEFAULT_ITEM_LENGTH: Record<PlanItemKind, number> = {
  header: 0,
  song: 300,
  item: 300,
}

/** 'yyyy-MM-dd' for today in the browser's timezone (plan dates are wall dates). */
export function todayISODate() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function formatPlanDate(date: string) {
  return format(parseISO(date), 'EEE d MMM yyyy')
}

export function formatPlanDateShort(date: string) {
  return format(parseISO(date), 'd MMM yyyy')
}

/** 330 -> '5:30'. Used for item lengths. */
export function formatLength(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Parse a length typed by a human: '5' (minutes), '5:30', or '0:45'.
 * Returns seconds, or null when it isn't parseable.
 */
export function parseLengthInput(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return 0
  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(trimmed)
  if (!match) return null
  const minutes = parseInt(match[1], 10)
  const seconds = match[2] ? parseInt(match[2], 10) : 0
  return minutes * 60 + seconds
}

/** 'HH:mm:ss' (time column) -> 'h:mm am' display, or null. */
export function formatStartTime(time: string | null) {
  if (!time) return null
  return format(parseISO(`2000-01-01T${time}`), 'h:mmaaa')
}

export type ServiceFrequency = Enums<'service_frequency'>

export const FREQUENCY_OPTIONS: ServiceFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
]

export const FREQUENCY_LABELS: Record<ServiceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

/** 0 = Sunday .. 6 = Saturday (matches service_types.days_of_week). */
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Sun, Wed, Sat" from day numbers, in week order. */
export function formatDaysOfWeek(days: number[]): string {
  return [...days]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(', ')
}

/** One-line schedule summary for the service types list. */
export function serviceTypeSummary(st: ServiceType): string {
  const parts: string[] = []
  if (st.frequency) parts.push(FREQUENCY_LABELS[st.frequency])
  if (st.days_of_week.length > 0) parts.push(formatDaysOfWeek(st.days_of_week))
  const start = formatStartTime(st.default_start_time)
  const end = formatStartTime(st.end_time)
  if (start && end) parts.push(`${start}–${end}`)
  else if (start) parts.push(start)
  return parts.length > 0 ? parts.join(' · ') : 'No schedule set'
}

export interface TimedPlanItem<T> {
  item: T
  /** Seconds after the service start at which this item begins. */
  offsetSeconds: number
  /** Wall-clock start, when the service type has a start time. */
  startsAt: Date | null
}

/**
 * The running clock: each item starts where the previous one ended.
 * `serviceStart` is the service type's default_start_time ('HH:mm:ss') or null.
 */
export function computeItemTimes<T extends { length_seconds: number }>(
  items: T[],
  planDate: string,
  serviceStart: string | null,
): { timed: TimedPlanItem<T>[]; totalSeconds: number; endsAt: Date | null } {
  const base = serviceStart ? parseISO(`${planDate}T${serviceStart}`) : null
  let offset = 0
  const timed = items.map((item) => {
    const entry: TimedPlanItem<T> = {
      item,
      offsetSeconds: offset,
      startsAt: base ? addSeconds(base, offset) : null,
    }
    offset += item.length_seconds
    return entry
  })
  return {
    timed,
    totalSeconds: offset,
    endsAt: base ? addSeconds(base, offset) : null,
  }
}

export function formatClock(date: Date) {
  return format(date, 'h:mm')
}

/** Total length as '1h 12m' / '45m' / '45m 30s'. */
export function formatTotalLength(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || h > 0) parts.push(`${m}m`)
  if (s > 0 && h === 0) parts.push(`${s}s`)
  if (parts.length === 0) parts.push('0m')
  return parts.join(' ')
}

/** Relative "last scheduled" label for the song library. */
export function formatLastScheduled(date: string | null) {
  if (!date) return null
  return formatPlanDateShort(date)
}

/** Comma-separated tag input -> clean string[]. */
export function parseTagsInput(input: string): string[] {
  return [...new Set(
    input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  )]
}
