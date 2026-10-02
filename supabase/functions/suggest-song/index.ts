// Suggest the next song to add to a plan (optional, Gemini).
//
// Unlike the lyrics helpers this is a reasoning task — it weighs musical key
// fit, the church's past song groupings and the plan's language balance — so it
// asks a stronger model (`GEMINI_SUGGEST_MODEL`, default below) with a higher
// thinking level, independent of the `GEMINI_MODEL` the lyrics features use.
//
// Optional per instance exactly like `lyrics-assist`: with no GEMINI_API_KEY
// every call answers `configured: false` and the Suggest button never appears.
//
// It writes nothing. It returns one song id for the client to add through the
// ordinary (RLS-gated) add-song path; rejected ids are remembered by the client
// and sent back so the model skips them until the scheduler moves to a new plan.

import { z } from 'npm:zod@4'
import { callerHasPermission, getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { askForObject, GeminiError, geminiConfigured } from '../_shared/gemini.ts'
import {
  buildSuggestPrompt,
  parseSuggestion,
  summarizeUsage,
  SUGGEST_SCHEMA,
  type Candidate,
  type PlanSong,
} from '../_shared/song-suggest.ts'

const SUGGEST_MODEL_DEFAULT = 'gemini-3.5-flash'
/** Bound the prompt: a church library is far smaller, but a fork might not be. */
const MAX_CANDIDATES = 300
const MAX_HISTORY_PLANS = 40

/**
 * Read every row, a page at a time. PostgREST stops a response at `max_rows`
 * (1000) without saying so, which would silently drop songs from a big library.
 * Throws on a query error rather than returning nothing — an empty library
 * would otherwise read as "no more songs to suggest".
 */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < size) return rows
  }
}

const schema = z.object({
  probe: z.boolean().optional(),
  planId: z.string().uuid().optional(),
  /** Songs the scheduler has already rejected for this plan — never re-offered. */
  rejectedSongIds: z.array(z.string().uuid()).max(500).optional(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = serviceClient()
  const caller = await getCallerPerson(req, admin)
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401)
  // Mirrors the plan-item write policy: whoever may edit the order of service
  // may ask for a song to add to it.
  if (!(await callerHasPermission(admin, caller, 'edit_order_of_service'))) {
    return jsonResponse({ error: 'You do not have permission to edit this plan' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const body = parsed.data

  const configured = geminiConfigured()
  if (body.probe) return jsonResponse({ configured })
  if (!configured) return jsonResponse({ configured: false, error: 'not_configured' }, 503)
  if (!body.planId) return jsonResponse({ error: 'planId is required' }, 400)

  // --- Plan ---------------------------------------------------------------
  try {
    return await suggest(admin, body.planId, body.rejectedSongIds ?? [])
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    // A database read failed. Answer in JSON so the client shows a real
    // message — an uncaught throw is a bare 500 the browser reports as a
    // network failure.
    console.error('suggest-song:', error)
    return jsonResponse({ error: 'Could not read the song library' }, 500)
  }
})

async function suggest(
  admin: ReturnType<typeof serviceClient>,
  planId: string,
  rejectedSongIds: string[],
): Promise<Response> {
  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, date, service_types(name)')
    .eq('id', planId)
    .maybeSingle()
  if (planError) throw new Error(planError.message)
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404)
  // A to-one embed is typed as an array by the generated types; take the first.
  const svc = plan.service_types as { name: string }[] | { name: string } | null
  const serviceType = (Array.isArray(svc) ? svc[0]?.name : svc?.name) ?? null

  // --- Library (songs, arrangements, junction) ----------------------------
  const [songs, arrRows, linkRows] = await Promise.all([
    fetchAll((from, to) =>
      admin.from('songs').select('id, title, author, tags, status').order('id').range(from, to),
    ),
    fetchAll((from, to) =>
      admin
        .from('song_arrangements')
        .select('id, song_key, bpm, is_default')
        .order('id')
        .range(from, to),
    ),
    fetchAll((from, to) =>
      admin
        .from('song_arrangement_songs')
        .select('arrangement_id, song_id')
        .order('arrangement_id')
        .order('song_id')
        .range(from, to),
    ),
  ])
  const arrangements = new Map(arrRows.map((a) => [a.id as string, a]))
  // song_id -> its arrangement ids, and arrangement_id -> its song ids
  const arrsForSong = new Map<string, string[]>()
  const songsForArr = new Map<string, string[]>()
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const link of linkRows) {
    const aId = link.arrangement_id as string
    const sId = link.song_id as string
    push(arrsForSong, sId, aId)
    push(songsForArr, aId, sId)
  }
  const songById = new Map(songs.map((s) => [s.id as string, s]))

  // --- Songs already on this plan -----------------------------------------
  const { data: itemRows, error: itemError } = await admin
    .from('plan_items')
    .select('arrangement_id, key_override')
    .eq('plan_id', planId)
    .eq('kind', 'song')
  if (itemError) throw new Error(itemError.message)
  const onPlanSongIds = new Set<string>()
  const current: PlanSong[] = []
  for (const item of itemRows ?? []) {
    const aId = item.arrangement_id as string | null
    if (!aId) continue
    const arr = arrangements.get(aId)
    for (const sId of songsForArr.get(aId) ?? []) {
      onPlanSongIds.add(sId)
      const song = songById.get(sId)
      if (!song) continue
      current.push({
        title: song.title as string,
        key: (item.key_override as string | null) ?? (arr?.song_key as string | null) ?? null,
        tags: (song.tags as string[] | null) ?? [],
        bpm: (arr?.bpm as number | null) ?? null,
      })
    }
  }

  // --- Usage: last-used date per song, and plan groupings for history -----
  const usageRows = await fetchAll((from, to) =>
    admin
      .from('song_plan_usage')
      .select('song_id, plan_id, date, service_type_name')
      .order('date', { ascending: false })
      .order('plan_item_id')
      .order('song_id')
      .range(from, to),
  )
  const planDate = (plan.date as string | null) ?? null
  const { lastUsed, history } = summarizeUsage(
    usageRows.map((row) => ({
      songId: row.song_id as string,
      planId: row.plan_id as string,
      date: row.date as string,
      serviceType: (row.service_type_name as string | null) ?? null,
    })),
    { planId, planDate, maxPlans: MAX_HISTORY_PLANS },
    (songId) => songById.get(songId)?.title as string | undefined,
  )

  // --- Candidates ---------------------------------------------------------
  const rejected = new Set(rejectedSongIds)
  const candidates: Candidate[] = songs
    .filter((s) => s.status === 'active')
    .filter((s) => !onPlanSongIds.has(s.id as string) && !rejected.has(s.id as string))
    .map((s) => {
      const keys = [
        ...new Set(
          (arrsForSong.get(s.id as string) ?? [])
            .map((aId) => arrangements.get(aId)?.song_key as string | null)
            .filter((k): k is string => Boolean(k)),
        ),
      ]
      const defaultArr = (arrsForSong.get(s.id as string) ?? [])
        .map((aId) => arrangements.get(aId))
        .find((a) => a?.is_default)
      return {
        id: s.id as string,
        title: s.title as string,
        author: (s.author as string | null) ?? null,
        tags: (s.tags as string[] | null) ?? [],
        keys,
        bpm: (defaultArr?.bpm as number | null) ?? null,
        lastUsed: lastUsed.get(s.id as string) ?? null,
      }
    })
    // Recently used first so the bounded slice keeps the most relevant songs.
    .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''))
    .slice(0, MAX_CANDIDATES)

  if (candidates.length === 0) return jsonResponse({ exhausted: true })

  // --- Ask the model (a GeminiError is answered by the caller's catch) -----
  const payload = await askForObject(
    buildSuggestPrompt({ serviceType, planDate, current, candidates, history }),
    {
      label: 'suggest-song',
      model: Deno.env.get('GEMINI_SUGGEST_MODEL') ?? SUGGEST_MODEL_DEFAULT,
      // A reasoning task (key fit, preference, language mix), unlike the
      // line-gloss lyrics jobs — but kept at 'medium', not 'high', because a
      // scheduler is waiting on it. Valid: minimal | low | medium | high.
      thinkingLevel: 'medium',
      schema: SUGGEST_SCHEMA,
    },
  )
  const choice = parseSuggestion(payload, new Set(candidates.map((c) => c.id)))
  if (!choice) return jsonResponse({ error: 'No suggestion came back' }, 422)
  const song = songById.get(choice.songId)
  return jsonResponse({
    songId: choice.songId,
    title: (song?.title as string) ?? '',
    reason: choice.reason,
    keyNote: choice.keyNote,
  })
}
