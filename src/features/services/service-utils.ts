import { addSeconds, format, parseISO } from 'date-fns'
import type { Enums, Tables } from '@/types/database'

export type Plan = Tables<'plans'>
export type PlanItem = Tables<'plan_items'>
export type ServiceType = Tables<'service_types'>
export type SongArrangement = Tables<'song_arrangements'>
/**
 * A library song with its Default arrangement's key/BPM/meter flattened on
 * (issue #24 moved these onto arrangements). Keeping them here lets the songs
 * list, picker and plan readers keep using `song.default_key` / `song.bpm`
 * unchanged; `meter` joined them for the lyrics sheet (issue #25).
 */
export type Song = Tables<'songs'> & {
  default_key: string | null
  bpm: number | null
  meter: string | null
}
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

/**
 * Pre-filled web-search links for a song (issue #22). Each opens a search in a
 * new tab — we never pull results into the app. The query is built from data
 * already on the page (title + author); no new data, no scraping, no API.
 */
export function songSearchLinks(title: string, author?: string | null) {
  const base = `${title} ${author ?? ''}`.trim()
  const q = encodeURIComponent(base)
  return {
    lyrics: `https://www.google.com/search?q=${encodeURIComponent(`${base} lyrics`)}`,
    chords: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}`,
    listen: `https://www.youtube.com/results?search_query=${q}`,
  }
}

/**
 * One song's entry on a plan's lyrics sheet (issue #25). Key/BPM/meter come
 * from the song's Default arrangement (already flattened onto `Song`); the
 * lyrics come from the song itself.
 */
export interface LyricsSheetEntry {
  songItemId: string
  title: string
  key: string | null
  bpm: number | null
  meter: string | null
  lyrics: string | null
}

/**
 * The lyrics sheet for a plan: every song in the order of service, in setlist
 * order, so reordering the setlist reorders the sheet for free. `songById` maps
 * a song id to the flattened library song (from `useSongs`).
 */
export function buildLyricsSheet(
  items: PlanItem[],
  songById: Map<string, Song>,
): LyricsSheetEntry[] {
  return items
    .filter((i) => i.kind === 'song')
    .map((i) => {
      const song = i.song_id ? songById.get(i.song_id) : undefined
      return {
        songItemId: i.id,
        title: song?.title ?? i.title,
        key: song?.default_key ?? null,
        bpm: song?.bpm ?? null,
        meter: song?.meter ?? null,
        lyrics: song?.lyrics ?? null,
      }
    })
}

/** "Key G  ·  72 BPM  ·  4/4" from an entry, or '' when none are set. */
export function lyricsSheetMeta(entry: {
  key: string | null
  bpm: number | null
  meter: string | null
}): string {
  return [
    entry.key ? `Key ${entry.key}` : null,
    entry.bpm ? `${entry.bpm} BPM` : null,
    entry.meter ? entry.meter : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
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
