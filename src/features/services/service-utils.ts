import { addDays, addSeconds, format, parseISO } from 'date-fns'
import type { Enums, Tables } from '@/types/database'
import { timesOverlap } from '@/features/scheduling/scheduling-utils'

export type Plan = Tables<'plans'>
export type PlanItem = Tables<'plan_items'>
export type ServiceType = Tables<'service_types'>
export type SongArrangement = Tables<'song_arrangements'>
export type ArrangementLyrics = Tables<'song_arrangement_lyrics'>
/**
 * A library song with its Default arrangement's key/BPM/meter flattened on
 * (issue #24 moved these onto arrangements). Keeping them here lets the songs
 * list, picker and plan readers keep using `song.default_key` / `song.bpm`
 * unchanged; `meter` joined them for the lyrics sheet (issue #25). Since #130
 * arrangements link to songs via the `song_arrangement_songs` junction, so each
 * song also carries its arrangements (Default first) — the picker uses them for
 * the arrangement step, and `buildArrangementIndex` derives medley names from
 * every song's junction rows.
 */
export type Song = Tables<'songs'> & {
  default_key: string | null
  bpm: number | null
  meter: string | null
  default_arrangement_id: string | null
  arrangements: SongArrangement[]
  /** This song's junction rows: arrangement id + the song's position in it. */
  arrangement_links: { arrangement_id: string; sort_order: number }[]
}

/** An arrangement plus the songs it is linked to, in medley order (#130). */
export interface ArrangementInfo {
  arrangement: SongArrangement
  songs: { id: string; title: string }[]
}

/**
 * arrangement id -> {arrangement, linked songs} across the whole library.
 * Each song's embed only carries its own junction row, so the full song list
 * of a medley is assembled by walking every song (#130).
 */
export function buildArrangementIndex(songs: Song[]): Map<string, ArrangementInfo> {
  const index = new Map<string, ArrangementInfo>()
  const sortKeys = new Map<string, number[]>()
  for (const song of songs) {
    for (const link of song.arrangement_links) {
      const arrangement = song.arrangements.find((a) => a.id === link.arrangement_id)
      let info = index.get(link.arrangement_id)
      if (!info) {
        if (!arrangement) continue
        info = { arrangement, songs: [] }
        index.set(link.arrangement_id, info)
        sortKeys.set(link.arrangement_id, [])
      }
      info.songs.push({ id: song.id, title: song.title })
      sortKeys.get(link.arrangement_id)!.push(link.sort_order)
    }
  }
  for (const [id, info] of index) {
    const keys = sortKeys.get(id)!
    info.songs = info.songs
      .map((s, i) => ({ s, key: keys[i] }))
      .sort((a, b) => a.key - b.key || a.s.title.localeCompare(b.s.title))
      .map((x) => x.s)
  }
  return index
}

/** True when the arrangement is linked to more than one song. */
export function isMedley(info: ArrangementInfo): boolean {
  return info.songs.length > 1
}

/**
 * Display title for an arrangement on a plan: the song title, "Song (Acoustic)"
 * for a named non-default arrangement, or "Song A / Song B" for a medley.
 */
export function arrangementDisplayTitle(info: ArrangementInfo): string {
  const names = info.songs.map((s) => s.title).join(' / ')
  if (isMedley(info) || info.arrangement.is_default) return names
  return `${names} (${info.arrangement.name})`
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

/**
 * Weekly 'yyyy-MM-dd' dates from `startISO` up to and including `endISO`
 * (issue #72). `endISO` before `startISO` yields just the start date; callers
 * validate that the repeat-until date is later. Capped to avoid runaway loops.
 */
export function weeklyDates(startISO: string, endISO: string, cap = 104): string[] {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  const dates: string[] = []
  for (let week = 0; week < cap; week++) {
    const d = addDays(start, week * 7)
    if (d > end && dates.length > 0) break
    dates.push(format(d, 'yyyy-MM-dd'))
    if (d > end) break
  }
  return dates
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

/**
 * Minimal shape of an existing plan needed to detect a service-time clash
 * (issue #78) — the date, its own start-time override, and its service type's
 * start/end times and name.
 */
export type ClashCandidate = {
  id: string
  date: string
  title: string | null
  start_time: string | null
  service_types: {
    name: string
    default_start_time: string | null
    end_time: string | null
  }
}

/** Shift an 'HH:mm:ss' time by whole seconds, keeping it a 'HH:mm:ss' string. */
function shiftTime(time: string, deltaSeconds: number): string {
  return format(addSeconds(parseISO(`2000-01-01T${time}`), deltaSeconds), 'HH:mm:ss')
}

/**
 * A plan's effective service window. The start is the plan's own `start_time`
 * override when set, else the service type's default. The end follows the
 * service type's `end_time`, shifted by the override delta so the window keeps
 * its length when the start moves (so an overridden evening service still has a
 * sensible end for clash comparison).
 */
export function planEffectiveTimes(p: {
  start_time: string | null
  service_types: { default_start_time: string | null; end_time: string | null }
}): { start: string | null; end: string | null } {
  const defStart = p.service_types.default_start_time
  const start = p.start_time ?? defStart
  let end = p.service_types.end_time
  if (p.start_time && defStart && end) {
    const deltaMs =
      parseISO(`2000-01-01T${p.start_time}`).getTime() -
      parseISO(`2000-01-01T${defStart}`).getTime()
    end = shiftTime(end, Math.round(deltaMs / 1000))
  }
  return { start, end }
}

/**
 * Existing plans whose service time clashes with a new service on `date`
 * (issue #78). We compare the *actual* start/end times (not the service type
 * identity), honouring each plan's per-plan start-time override, so two
 * services on one day at non-overlapping times are fine while overlapping
 * windows clash even when their start or end differ. `start`/`end` are the new
 * service's effective 'HH:mm:ss' times. `excludeId` skips a plan from the
 * comparison (e.g. the plan being duplicated).
 */
export function findClashingPlans(
  candidate: {
    date: string
    start: string | null
    end: string | null
    excludeId?: string
  },
  existing: ClashCandidate[],
): ClashCandidate[] {
  return existing.filter((p) => {
    if (p.id === candidate.excludeId || p.date !== candidate.date) return false
    const e = planEffectiveTimes(p)
    return timesOverlap(candidate.start, candidate.end, e.start, e.end)
  })
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
 * `serviceStart` is the plan's effective start ('HH:mm:ss') — its own start_time
 * override when set, else the service type's default_start_time — or null.
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
 * One song's entry on a plan's lyrics sheet (issue #25). Since #130 the
 * key/BPM/meter come from the item's arrangement, the title covers medleys
 * ("Song A / Song B"), and the lyrics are the item's pinned version when the
 * plan is published, else the arrangement's latest.
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
 * order, so reordering the setlist reorders the sheet for free. `arrangements`
 * comes from `buildArrangementIndex`; `lyricsById` holds every lyrics version
 * of the plan's arrangements (pinned versions are always among them).
 */
export function buildLyricsSheet(
  items: PlanItem[],
  arrangements: Map<string, ArrangementInfo>,
  lyricsById: Map<string, ArrangementLyrics>,
): LyricsSheetEntry[] {
  const latestByArrangement = new Map<string, ArrangementLyrics>()
  for (const row of lyricsById.values()) {
    const current = latestByArrangement.get(row.arrangement_id)
    if (!current || row.version > current.version) {
      latestByArrangement.set(row.arrangement_id, row)
    }
  }
  return items
    .filter((i) => i.kind === 'song')
    .map((i) => {
      const info = i.arrangement_id ? arrangements.get(i.arrangement_id) : undefined
      const pinned = i.lyrics_id ? lyricsById.get(i.lyrics_id) : undefined
      const latest = i.arrangement_id
        ? latestByArrangement.get(i.arrangement_id)
        : undefined
      return {
        songItemId: i.id,
        title: info ? arrangementDisplayTitle(info) : i.title,
        key: i.key_override ?? info?.arrangement.song_key ?? null,
        bpm: info?.arrangement.bpm ?? null,
        meter: info?.arrangement.meter ?? null,
        lyrics: (pinned ?? latest)?.lyrics ?? null,
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
