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
  SUGGEST_SCHEMA,
  type Candidate,
  type HistoryPlan,
  type PlanSong,
} from '../_shared/song-suggest.ts'

const SUGGEST_MODEL_DEFAULT = 'gemini-3.5-flash'
/** Bound the prompt: a church library is far smaller, but a fork might not be. */
const MAX_CANDIDATES = 300
const MAX_HISTORY_PLANS = 40

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
  const { data: plan } = await admin
    .from('plans')
    .select('id, date, service_types(name)')
    .eq('id', body.planId)
    .maybeSingle()
  if (!plan) return jsonResponse({ error: 'Plan not found' }, 404)
  // A to-one embed is typed as an array by the generated types; take the first.
  const svc = plan.service_types as { name: string }[] | { name: string } | null
  const serviceType = (Array.isArray(svc) ? svc[0]?.name : svc?.name) ?? null

  // --- Library (songs, arrangements, junction) ----------------------------
  const [{ data: songRows }, { data: arrRows }, { data: linkRows }] = await Promise.all([
    admin.from('songs').select('id, title, author, tags, status'),
    admin.from('song_arrangements').select('id, song_key, bpm, is_default'),
    admin.from('song_arrangement_songs').select('arrangement_id, song_id'),
  ])
  const songs = songRows ?? []
  const arrangements = new Map(
    (arrRows ?? []).map((a) => [a.id as string, a]),
  )
  // song_id -> its arrangement ids, and arrangement_id -> its song ids
  const arrsForSong = new Map<string, string[]>()
  const songsForArr = new Map<string, string[]>()
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const link of linkRows ?? []) {
    const aId = link.arrangement_id as string
    const sId = link.song_id as string
    push(arrsForSong, sId, aId)
    push(songsForArr, aId, sId)
  }
  const songById = new Map(songs.map((s) => [s.id as string, s]))

  // --- Songs already on this plan -----------------------------------------
  const { data: itemRows } = await admin
    .from('plan_items')
    .select('arrangement_id, key_override')
    .eq('plan_id', body.planId)
    .eq('kind', 'song')
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
  const { data: usageRows } = await admin
    .from('song_plan_usage')
    .select('song_id, plan_id, date, service_type_name')
    .order('date', { ascending: false })
  const lastUsed = new Map<string, string>()
  const byPlan = new Map<
    string,
    { date: string; serviceType: string | null; songIds: Set<string> }
  >()
  for (const row of usageRows ?? []) {
    const sId = row.song_id as string
    const date = row.date as string
    if (!lastUsed.has(sId)) lastUsed.set(sId, date)
    const pId = row.plan_id as string
    let group = byPlan.get(pId)
    if (!group) {
      group = {
        date,
        serviceType: (row.service_type_name as string | null) ?? null,
        songIds: new Set(),
      }
      byPlan.set(pId, group)
    }
    group.songIds.add(sId)
  }
  const history: HistoryPlan[] = [...byPlan.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_HISTORY_PLANS)
    .map((g) => ({
      date: g.date,
      serviceType: g.serviceType,
      songs: [...g.songIds]
        .map((id) => songById.get(id)?.title as string | undefined)
        .filter((t): t is string => Boolean(t)),
    }))

  // --- Candidates ---------------------------------------------------------
  const rejected = new Set(body.rejectedSongIds ?? [])
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

  // --- Ask the model ------------------------------------------------------
  try {
    const payload = await askForObject(
      buildSuggestPrompt({
        serviceType,
        planDate: (plan.date as string | null) ?? null,
        current,
        candidates,
        history,
      }),
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
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    throw error
  }
})
