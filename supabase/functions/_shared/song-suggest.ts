// Pure helpers for the `suggest-song` function: the shapes the handler
// assembles, the prompt it sends, and the validation of what comes back.
//
// Nothing here touches Deno or the database, so it is unit-tested directly.
// The handler does the IO (read the plan, the library and the usage history),
// hands a `SuggestContext` to `buildSuggestPrompt`, and feeds the model's JSON
// to `parseSuggestion` with the set of ids it is allowed to return.

/** A song already on the plan, with the key it is sung in there. */
export interface PlanSong {
  title: string
  /** The key in use on the plan — the per-plan override, else the arrangement's. */
  key: string | null
  /** Library tags; may carry language (e.g. "Malayalam", "Hindi", "English"). */
  tags: string[]
  bpm: number | null
}

/** A library song the model may pick from. */
export interface Candidate {
  id: string
  title: string
  author: string | null
  tags: string[]
  /** Distinct keys this song has arrangements in — empty is itself a signal. */
  keys: string[]
  bpm: number | null
  /** ISO date this song was last on any plan, or null if never. */
  lastUsed: string | null
}

/** One past plan's song grouping — the church-preference and language signal. */
export interface HistoryPlan {
  date: string
  serviceType: string | null
  songs: string[]
}

export interface SuggestContext {
  serviceType: string | null
  planDate: string | null
  current: PlanSong[]
  candidates: Candidate[]
  history: HistoryPlan[]
}

export interface Suggestion {
  songId: string
  reason: string
  keyNote: string
}

/** The structured-output shape asked of the model. */
export const SUGGEST_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    songId: { type: 'string' },
    reason: { type: 'string' },
    keyNote: { type: 'string' },
  },
  required: ['songId', 'reason', 'keyNote'],
}

const REASON_MAX = 240
const KEY_NOTE_MAX = 140

/**
 * Compose the instruction and the context the model picks from.
 *
 * The context is sent as compact JSON rather than prose — the lists can run to
 * a few hundred songs, and a labelled JSON block is both shorter and less
 * ambiguous than sentences. The instruction is explicit about the three things
 * the worship team cares about, in the order they matter.
 */
export function buildSuggestPrompt(ctx: SuggestContext): string {
  const context = {
    plan: {
      serviceType: ctx.serviceType,
      date: ctx.planDate,
      songsAlreadyChosen: ctx.current.map((s) => ({
        title: s.title,
        key: s.key,
        bpm: s.bpm,
        tags: s.tags,
      })),
    },
    // Past plans, newest first — which songs this church groups together, and
    // the language mix it tends to keep per service.
    recentPlans: ctx.history.map((h) => ({
      date: h.date,
      serviceType: h.serviceType,
      songs: h.songs,
    })),
    // The only songs you may suggest. `keys` lists the keys this song already
    // has an arrangement in; an empty list does not disqualify it.
    candidates: ctx.candidates.map((c) => ({
      songId: c.id,
      title: c.title,
      author: c.author,
      tags: c.tags,
      arrangementKeys: c.keys,
      bpm: c.bpm,
      lastUsed: c.lastUsed,
    })),
  }

  return [
    'You help a church worship team choose the next song to add to a service plan.',
    'Pick exactly ONE song from `candidates` that would go best next, judging in this order:',
    '',
    '1. Musical fit. The songs already chosen are sung in the keys shown. Prefer a',
    '   song that sits well sung in or near those keys and flows from them in feel and',
    '   tempo. A strong fit still counts even if it has no arrangement in that key yet',
    "   (`arrangementKeys` may not include it) — the team can transpose; say so in keyNote.",
    '2. Church preference. Learn from `recentPlans` which songs this church groups',
    '   together and the kind of set it builds, and prefer a song consistent with that.',
    '   `lastUsed` is when a candidate was last sung before this service: avoid one sung',
    '   in the last few weeks unless the history shows this church repeats that often.',
    '3. Language balance. Tags may name a language (e.g. English, Malayalam, Hindi).',
    '   Keep the language mix of the plan sensible for this church, judged from how its',
    '   recent plans mixed languages — do not overload one language or drop an expected one.',
    '',
    'Return a JSON object: {"songId": <one id from candidates>, "reason": <one short',
    'sentence, why this song next>, "keyNote": <a few words on how it sits against the',
    "current keys, e.g. \"works in G, transpose from its D arrangement\">}.",
    'The songId MUST be one of the candidate songIds. Do not invent a song.',
    '',
    'CONTEXT:',
    JSON.stringify(context),
  ].join('\n')
}

/** One row of `song_plan_usage`: a song on a plan on a date. */
export interface UsageRow {
  songId: string
  planId: string
  date: string
  serviceType: string | null
}

/**
 * Turn raw usage rows into what the prompt needs: when each song was last sung
 * and the song groupings of recent plans.
 *
 * The plan being built is skipped — its songs are the question, not the
 * history — and "last used" counts only dates before that plan's service, so a
 * song already booked for next month doesn't read as one just sung. History is
 * newest plan first, capped at `maxPlans`; songs `titleOf` can't name (deleted
 * since) are dropped. Rows may arrive in any order.
 */
export function summarizeUsage(
  rows: UsageRow[],
  opts: { planId: string; planDate: string | null; maxPlans: number },
  titleOf: (songId: string) => string | undefined,
): { lastUsed: Map<string, string>; history: HistoryPlan[] } {
  const lastUsed = new Map<string, string>()
  const byPlan = new Map<
    string,
    { date: string; serviceType: string | null; songIds: Set<string> }
  >()
  for (const row of rows) {
    if (row.planId === opts.planId) continue
    const before = opts.planDate === null || row.date < opts.planDate
    const seen = lastUsed.get(row.songId)
    if (before && (seen === undefined || row.date > seen)) lastUsed.set(row.songId, row.date)
    let group = byPlan.get(row.planId)
    if (!group) {
      group = { date: row.date, serviceType: row.serviceType, songIds: new Set() }
      byPlan.set(row.planId, group)
    }
    group.songIds.add(row.songId)
  }
  const history = [...byPlan.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, opts.maxPlans)
    .map((g) => ({
      date: g.date,
      serviceType: g.serviceType,
      songs: [...g.songIds]
        .map(titleOf)
        .filter((t): t is string => Boolean(t)),
    }))
  return { lastUsed, history }
}

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const cap = (s: string, n: number): string => (s.length > n ? s.slice(0, n).trimEnd() : s)

/**
 * Validate the model's reply against the ids it was allowed to return.
 *
 * Returns null — not a throw — when the pick is missing or outside the
 * candidate set, so the handler can answer "no suggestion" rather than add a
 * song nobody offered. `reason` and `keyNote` are coerced and capped; a blank
 * reason is tolerated (the song id is the load-bearing part), a blank or
 * unknown id is not.
 */
export function parseSuggestion(
  payload: Record<string, unknown>,
  allowedIds: ReadonlySet<string>,
): Suggestion | null {
  const songId = asString(payload.songId)
  if (!songId || !allowedIds.has(songId)) return null
  return {
    songId,
    reason: cap(asString(payload.reason), REASON_MAX),
    keyNote: cap(asString(payload.keyNote), KEY_NOTE_MAX),
  }
}
