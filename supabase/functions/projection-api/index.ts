// Projection API (issue #135): read-only endpoints for the church's Mac
// projection software. verify_jwt = false — the credential is an admin-issued
// API key (Settings → Projection API); only its sha-256 hash is stored, in
// projection_api_keys. Contract doc: docs/PROJECTION-API.md (apiVersion 1).
//
//   GET /projection-api/plans               published plans, −10…+60 days
//   GET /projection-api/plans/:id/lyrics    lyrics sheet for one plan
//
// Every request is logged to projection_api_requests (rate limiting + CCLI
// usage audit), refusals with the reason why (0072, `_shared/projection-log.ts`).
// Lyrics never appear in console logs — IDs and counts only.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { serviceClient } from '../_shared/auth.ts'
import {
  clip,
  keyPrefixOf,
  refusalCapReached,
  type ProjectionReason,
} from '../_shared/projection-log.ts'
import { addDaysISO, sha256Hex, todayInTimezone } from '../_shared/scheduling.ts'
import {
  chordsToLetters,
  parseSongKey,
  type ChordNotation,
} from '../_shared/chord-notation.ts'
import { apiSequence, toApiSections } from '../_shared/lyric-sections.ts'

const API_VERSION = 1
const WINDOW_DAYS_BACK = 10
const WINDOW_DAYS_AHEAD = 60
const RATE_LIMIT_PER_MINUTE = 60

// Native macOS clients don't enforce CORS; the permissive headers just keep
// the door open for an Electron/browser-based operator tool.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

const KEY_RE = /^lscp_[0-9a-f]{64}$/
// Anything Postgres accepts as a uuid (zod's z.uuid() is stricter — it
// enforces RFC 4122 version/variant nibbles, which the column does not).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function extractRawKey(req: Request): string | null {
  const explicit = req.headers.get('x-api-key')?.trim()
  if (explicit) return explicit
  const auth = req.headers.get('authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
}

function toHHMM(time: string | null): string | null {
  return time ? time.slice(0, 5) : null
}

/**
 * What one request's log row is built from, and `respond`, which writes the
 * row and answers. Made before anything can fail, so a crash in the handler is
 * still logged (as `internal_error`) with whatever was known by then.
 */
interface RequestLog {
  admin: SupabaseClient
  endpoint: 'plans' | 'lyrics' | null
  rawPlanId: string | null
  /** The key the request used, once known — a revoked one included. */
  keyId: string | null
  /** The display prefix of a key that matched nothing. */
  keyPrefix: string | null
  respond: (
    body: unknown,
    status: number,
    reason: ProjectionReason,
    detail?: string | null,
  ) => Promise<Response>
}

function requestLog(req: Request): RequestLog {
  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const fnIdx = segments.indexOf('projection-api')
  const route = fnIdx >= 0 ? segments.slice(fnIdx + 1) : segments

  const endpoint =
    route.length === 1 && route[0] === 'plans'
      ? 'plans'
      : route.length === 3 && route[0] === 'plans' && route[2] === 'lyrics'
        ? 'lyrics'
        : null
  const rawPlanId = endpoint === 'lyrics' ? route[1] : null

  const admin = serviceClient()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const path = clip(`/${route.join('/')}${url.search}`, 200)
  const userAgent = clip(req.headers.get('user-agent'), 300)

  const log: RequestLog = {
    admin,
    endpoint,
    rawPlanId,
    keyId: null,
    keyPrefix: null,
    respond: async (body, status, reason, detail = null) => {
      // A flood of refusals from one address is answered but only partly
      // written down (REFUSED_PER_IP_PER_MINUTE).
      if (status === 401 && (await refusalCapReached(admin, ip))) {
        return json(body, status)
      }
      // The log is best-effort; the endpoint must answer even if it fails.
      const planIdForLog = rawPlanId && UUID_RE.test(rawPlanId) ? rawPlanId : null
      const { error } = await admin.from('projection_api_requests').insert({
        key_id: log.keyId,
        endpoint: endpoint ?? 'unknown',
        plan_id: planIdForLog,
        http_status: status,
        ip,
        reason,
        key_prefix: log.keyPrefix,
        method: req.method.slice(0, 10),
        path,
        user_agent: userAgent,
        detail: clip(detail, 300),
      })
      if (error) console.error('projection-api: request log insert failed:', error.message)
      return json(body, status)
    },
  }
  return log
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const log = requestLog(req)
  try {
    return await handle(req, log)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('projection-api: unhandled error:', message)
    return log.respond({ error: 'internal_error' }, 500, 'internal_error', message)
  }
})

async function handle(req: Request, log: RequestLog): Promise<Response> {
  const { admin, endpoint, rawPlanId, respond } = log

  // -- authenticate the key ---------------------------------------------------
  const rawKey = extractRawKey(req)
  if (!rawKey) return respond({ error: 'unauthorised' }, 401, 'missing_key')
  if (!KEY_RE.test(rawKey)) {
    log.keyPrefix = keyPrefixOf(rawKey)
    return respond({ error: 'unauthorised' }, 401, 'malformed_key')
  }
  const { data: key, error: keyErr } = await admin
    .from('projection_api_keys')
    .select('id, revoked_at')
    .eq('key_hash', await sha256Hex(rawKey))
    .maybeSingle()
  if (keyErr) {
    console.error('projection-api: key lookup failed:', keyErr.message)
    return respond(
      { error: 'database_error' },
      500,
      'database_error',
      `key lookup failed: ${keyErr.message}`,
    )
  }
  if (!key) {
    log.keyPrefix = keyPrefixOf(rawKey)
    return respond({ error: 'unauthorised' }, 401, 'unknown_key')
  }
  // Refused just like an unknown key, but logged against it, so the log names
  // the device still calling with it.
  log.keyId = key.id as string
  if (key.revoked_at) return respond({ error: 'unauthorised' }, 401, 'revoked_key')
  const keyId = log.keyId

  if (req.method !== 'GET') {
    return respond({ error: 'method_not_allowed' }, 405, 'method_not_allowed')
  }
  if (!endpoint) return respond({ error: 'not_found' }, 404, 'not_found')

  // -- rate limit --------------------------------------------------------------
  // Refused requests (429) are logged but not counted: counting them would keep
  // a client that polls once a second or faster locked out for as long as it
  // keeps polling.
  const windowStart = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('projection_api_requests')
    .select('id', { count: 'exact', head: true })
    .eq('key_id', keyId)
    .neq('http_status', 429)
    .gte('requested_at', windowStart)
  if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return respond(
      { error: 'rate_limited', message: 'Max 60 requests per minute' },
      429,
      'rate_limited',
    )
  }

  // Fire-and-forget freshness marker for the Settings key list.
  await admin
    .from('projection_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyId)

  const { data: church } = await admin
    .from('church_settings')
    .select('name, timezone, projection_chord_notation')
    .maybeSingle()
  const timezone = church?.timezone ?? 'Australia/Sydney'
  // Chords are stored as numbers of the key. Which notation goes down the wire
  // is an instance setting rather than a reader's, because there is no reader
  // to ask here and what this feeds is one screen the whole band reads off.
  // Letters unless an admin says otherwise: that is what this API has always
  // sent, so an instance that upgrades keeps parsing exactly what it did.
  const notation: ChordNotation =
    church?.projection_chord_notation === 'numbers' ? 'numbers' : 'letters'
  const today = todayInTimezone(timezone)
  const windowFrom = addDaysISO(today, -WINDOW_DAYS_BACK)
  const windowTo = addDaysISO(today, WINDOW_DAYS_AHEAD)

  // -- endpoint 1: published plans in the window --------------------------------
  if (endpoint === 'plans') {
    const { data: planRows, error } = await admin
      .from('plans')
      .select('id, date, title, start_time, service_types(name, default_start_time)')
      .eq('status', 'published')
      .gte('date', windowFrom)
      .lte('date', windowTo)
      .order('date', { ascending: true })
    if (error) {
      console.error('projection-api: plans query failed:', error.message)
      return respond({ error: 'database_error' }, 500, 'database_error',
        `plans query failed: ${error.message}`)
    }

    const planIds = (planRows ?? []).map((p) => p.id as string)
    const songCounts = new Map<string, number>()
    if (planIds.length > 0) {
      const { data: itemRows, error: itemErr } = await admin
        .from('plan_items')
        .select('plan_id')
        .eq('kind', 'song')
        .in('plan_id', planIds)
      if (itemErr) {
        console.error('projection-api: song count query failed:', itemErr.message)
        return respond({ error: 'database_error' }, 500, 'database_error',
          `song count query failed: ${itemErr.message}`)
      }
      for (const row of itemRows ?? []) {
        const id = row.plan_id as string
        songCounts.set(id, (songCounts.get(id) ?? 0) + 1)
      }
    }

    const plans = (planRows ?? [])
      .map((p) => {
        const st = p.service_types as unknown as {
          name: string
          default_start_time: string | null
        }
        return {
          id: p.id as string,
          date: p.date as string,
          serviceType: st.name,
          title: (p.title as string | null) ?? null,
          startTime: toHHMM((p.start_time as string | null) ?? st.default_start_time),
          songCount: songCounts.get(p.id as string) ?? 0,
        }
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'),
      )

    return respond(
      {
        apiVersion: API_VERSION,
        generatedAt: new Date().toISOString(),
        window: { from: windowFrom, to: windowTo },
        plans,
      },
      200,
      'ok',
    )
  }

  // -- endpoint 2: lyrics sheet for one plan -------------------------------------
  if (!rawPlanId || !UUID_RE.test(rawPlanId)) {
    return respond({ error: 'plan_not_found' }, 404, 'plan_not_found', 'not a plan id')
  }

  const { data: plan, error: planErr } = await admin
    .from('plans')
    .select('id, date, title, status, service_types(name)')
    .eq('id', rawPlanId!)
    .eq('status', 'published')
    .gte('date', windowFrom)
    .lte('date', windowTo)
    .maybeSingle()
  if (planErr) {
    console.error('projection-api: plan query failed:', planErr.message)
    return respond({ error: 'database_error' }, 500, 'database_error',
      `plan query failed: ${planErr.message}`)
  }
  if (!plan) {
    // The client is told only plan_not_found, as documented; the log says which
    // of the three it was, so an admin can see a draft being asked for.
    const { data: found } = await admin
      .from('plans')
      .select('status')
      .eq('id', rawPlanId)
      .maybeSingle()
    const reason: ProjectionReason = !found
      ? 'plan_not_found'
      : found.status !== 'published'
        ? 'plan_not_published'
        : 'plan_outside_window'
    return respond({ error: 'plan_not_found' }, 404, reason)
  }

  const { data: itemRows, error: itemsErr } = await admin
    .from('plan_items')
    .select('id, sort_order, title, arrangement_id, lyrics_id, key_override, sequence')
    .eq('plan_id', plan.id)
    .eq('kind', 'song')
    .order('sort_order', { ascending: true })
  if (itemsErr) {
    console.error('projection-api: plan items query failed:', itemsErr.message)
    return respond({ error: 'database_error' }, 500, 'database_error',
      `plan items query failed: ${itemsErr.message}`)
  }
  const items = itemRows ?? []
  const arrangementIds = [
    ...new Set(items.map((i) => i.arrangement_id as string | null).filter(Boolean)),
  ] as string[]

  interface ArrangementRow {
    id: string
    name: string
    song_key: string | null
    bpm: number | null
    meter: string | null
  }
  interface LyricsRow {
    id: string
    arrangement_id: string
    version: number
    lyrics: string
    lyrics_native: string | null
    lyrics_meaning: string | null
    lyrics_chords: string | null
    native_language: string | null
    sequence: string[] | null
  }
  interface JunctionRow {
    arrangement_id: string
    sort_order: number
    songs: {
      title: string
      author: string | null
      ccli_number: string | null
      copyright: string | null
    } | null
  }

  const arrangementById = new Map<string, ArrangementRow>()
  const lyricsById = new Map<string, LyricsRow>()
  const latestByArrangement = new Map<string, LyricsRow>()
  const sourceSongsByArrangement = new Map<string, JunctionRow[]>()

  if (arrangementIds.length > 0) {
    const [arrRes, lyrRes, junRes] = await Promise.all([
      admin
        .from('song_arrangements')
        .select('id, name, song_key, bpm, meter')
        .in('id', arrangementIds),
      admin
        .from('song_arrangement_lyrics')
        .select(
          'id, arrangement_id, version, lyrics, lyrics_native, lyrics_meaning, lyrics_chords, native_language, sequence',
        )
        .in('arrangement_id', arrangementIds),
      admin
        .from('song_arrangement_songs')
        .select('arrangement_id, sort_order, songs(title, author, ccli_number, copyright)')
        .in('arrangement_id', arrangementIds),
    ])
    if (arrRes.error || lyrRes.error || junRes.error) {
      const msg =
        arrRes.error?.message ?? lyrRes.error?.message ?? junRes.error?.message
      console.error('projection-api: song detail query failed:', msg)
      return respond({ error: 'database_error' }, 500, 'database_error',
        `song detail query failed: ${msg}`)
    }
    for (const a of (arrRes.data ?? []) as unknown as ArrangementRow[]) {
      arrangementById.set(a.id, a)
    }
    for (const l of (lyrRes.data ?? []) as unknown as LyricsRow[]) {
      lyricsById.set(l.id, l)
      const latest = latestByArrangement.get(l.arrangement_id)
      if (!latest || l.version > latest.version) {
        latestByArrangement.set(l.arrangement_id, l)
      }
    }
    for (const row of (junRes.data ?? []) as unknown as JunctionRow[]) {
      const list = sourceSongsByArrangement.get(row.arrangement_id) ?? []
      list.push(row)
      sourceSongsByArrangement.set(row.arrangement_id, list)
    }
  }

  const songs = items.map((item, idx) => {
    const arrangementId = item.arrangement_id as string | null
    const arrangement = arrangementId ? arrangementById.get(arrangementId) : undefined
    // Published plans pin the lyrics version (plan_items.lyrics_id); fall back
    // to the arrangement's latest for the rare unpinned item.
    const pinned = item.lyrics_id ? lyricsById.get(item.lyrics_id as string) : undefined
    const lyricsRow =
      pinned ?? (arrangementId ? latestByArrangement.get(arrangementId) : undefined)
    const sources = (arrangementId ? sourceSongsByArrangement.get(arrangementId) : []) ?? []
    // The key this plan plays the song in, which is also the key its stored
    // chord numbers are read back in — so an item's key override transposes
    // the chords that go out with it.
    const key = (item.key_override as string | null) ?? arrangement?.song_key ?? null
    const projected: LyricsRow | null = !lyricsRow
      ? null
      : {
        ...lyricsRow,
        lyrics_chords: notation === 'letters'
          ? chordsToLetters(lyricsRow.lyrics_chords ?? '', parseSongKey(key))
          : (lyricsRow.lyrics_chords ?? ''),
      }
    const sections = toApiSections(lyricsRow?.lyrics, projected)
    return {
      order: idx + 1,
      title: item.title as string,
      arrangement: arrangement?.name ?? null,
      key,
      bpm: arrangement?.bpm ?? null,
      meter: arrangement?.meter ?? null,
      lyricsVersion: lyricsRow?.version ?? null,
      lyrics: lyricsRow?.lyrics ?? null,
      // Additive since apiVersion 1 (#139): `lyrics` and `sections[].lines`
      // keep their exact meaning — the Latin singable text — so a client that
      // predates the layers is unaffected. nativeLanguage is an ISO 639 code
      // ('ml', 'hi') for whatever `sections[].layers.native` is written in.
      nativeLanguage: lyricsRow?.native_language ?? null,
      // The order to sing the sections in, as their labels: this plan's
      // sequence, else the one saved with the lyrics version. `sections` stays
      // the whole song, so the operator can put up a part it leaves out.
      sequence: apiSequence(sections, [
        item.sequence as string[] | null,
        lyricsRow?.sequence,
      ]),
      sections,
      sourceSongs: sources
        .filter((s) => s.songs)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          title: s.songs!.title,
          author: s.songs!.author,
          ccli: s.songs!.ccli_number,
          copyright: s.songs!.copyright,
        })),
    }
  })

  return respond(
    {
      apiVersion: API_VERSION,
      planId: plan.id as string,
      date: plan.date as string,
      serviceType: (plan.service_types as unknown as { name: string }).name,
      title: (plan.title as string | null) ?? null,
      churchName: church?.name ?? 'LSCroster',
      generatedAt: new Date().toISOString(),
      songs,
    },
    200,
    'ok',
  )
}
