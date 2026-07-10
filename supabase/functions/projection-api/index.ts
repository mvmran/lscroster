// Projection API (issue #135): read-only endpoints for the church's Mac
// projection software. verify_jwt = false — the credential is an admin-issued
// API key (Settings → Projection API); only its sha-256 hash is stored, in
// projection_api_keys. Contract doc: docs/PROJECTION-API.md (apiVersion 1).
//
//   GET /projection-api/plans               published plans, −10…+60 days
//   GET /projection-api/plans/:id/lyrics    lyrics sheet for one plan
//
// Every request is logged to projection_api_requests (rate limiting + CCLI
// usage audit). Lyrics never appear in console logs — IDs and counts only.

import { serviceClient } from '../_shared/auth.ts'
import { addDaysISO, sha256Hex, todayInTimezone } from '../_shared/scheduling.ts'
import { toApiSections } from '../_shared/lyric-sections.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

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

  // -- authenticate the key ---------------------------------------------------
  let keyId: string | null = null
  const respond = async (body: unknown, status: number): Promise<Response> => {
    // The log is best-effort; the endpoint must answer even if it fails.
    const planIdForLog = rawPlanId && UUID_RE.test(rawPlanId) ? rawPlanId : null
    const { error } = await admin.from('projection_api_requests').insert({
      key_id: keyId,
      endpoint: endpoint ?? 'unknown',
      plan_id: planIdForLog,
      http_status: status,
      ip,
    })
    if (error) console.error('projection-api: request log insert failed:', error.message)
    return json(body, status)
  }

  const rawKey = extractRawKey(req)
  if (!rawKey || !KEY_RE.test(rawKey)) {
    return respond({ error: 'unauthorized' }, 401)
  }
  const { data: key } = await admin
    .from('projection_api_keys')
    .select('id')
    .eq('key_hash', await sha256Hex(rawKey))
    .is('revoked_at', null)
    .maybeSingle()
  if (!key) return respond({ error: 'unauthorized' }, 401)
  keyId = key.id as string

  if (req.method !== 'GET') return respond({ error: 'method_not_allowed' }, 405)
  if (!endpoint) return respond({ error: 'not_found' }, 404)

  // -- rate limit --------------------------------------------------------------
  const windowStart = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('projection_api_requests')
    .select('id', { count: 'exact', head: true })
    .eq('key_id', keyId)
    .gte('requested_at', windowStart)
  if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return respond({ error: 'rate_limited', message: 'Max 60 requests per minute' }, 429)
  }

  // Fire-and-forget freshness marker for the Settings key list.
  await admin
    .from('projection_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyId)

  const { data: church } = await admin
    .from('church_settings')
    .select('name, timezone')
    .maybeSingle()
  const timezone = church?.timezone ?? 'Australia/Sydney'
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
      return respond({ error: 'database_error' }, 500)
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
        return respond({ error: 'database_error' }, 500)
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
    )
  }

  // -- endpoint 2: lyrics sheet for one plan -------------------------------------
  if (!rawPlanId || !UUID_RE.test(rawPlanId)) {
    return respond({ error: 'plan_not_found' }, 404)
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
    return respond({ error: 'database_error' }, 500)
  }
  if (!plan) return respond({ error: 'plan_not_found' }, 404)

  const { data: itemRows, error: itemsErr } = await admin
    .from('plan_items')
    .select('id, sort_order, title, arrangement_id, lyrics_id, key_override')
    .eq('plan_id', plan.id)
    .eq('kind', 'song')
    .order('sort_order', { ascending: true })
  if (itemsErr) {
    console.error('projection-api: plan items query failed:', itemsErr.message)
    return respond({ error: 'database_error' }, 500)
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
        .select('id, arrangement_id, version, lyrics')
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
      return respond({ error: 'database_error' }, 500)
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
    return {
      order: idx + 1,
      title: item.title as string,
      arrangement: arrangement?.name ?? null,
      key: (item.key_override as string | null) ?? arrangement?.song_key ?? null,
      bpm: arrangement?.bpm ?? null,
      meter: arrangement?.meter ?? null,
      lyricsVersion: lyricsRow?.version ?? null,
      lyrics: lyricsRow?.lyrics ?? null,
      sections: toApiSections(lyricsRow?.lyrics),
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
  )
})
