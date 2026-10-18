// Estimate how long a song on a plan will take (Gemini), for its Length box.
//
// The plan's Edit song dialog sends the arrangement (and the lyrics version the
// plan is pinned to, if it is) with the tempo the plan plays it at. This reads
// the lyrics and chords itself — the song as written is the order it's sung —
// asks the model to count the bars in each section, works the seconds out
// from those bars, the tempo and the meter, and adds the changeover between
// songs. It writes nothing: the number goes into the Length box, where the
// scheduler can still change it before saving.
//
// Optional per instance, like the other AI helpers: no GEMINI_API_KEY and the
// probe answers `configured: false`, so the button never appears. Gated on
// edit_order_of_service, like suggest-song — it fills in a plan item.

import { z } from 'npm:zod@4'
import { callerHasPermission, getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { askForObject, GeminiError, geminiConfigured } from '../_shared/gemini.ts'
import {
  LENGTH_SCHEMA,
  lengthPrompt,
  planLength,
  playedSections,
  SONG_CHANGE_SECONDS,
  songSeconds,
} from '../_shared/song-length.ts'

const schema = z.object({
  /** Probe for whether the feature is configured at all; no model call. */
  probe: z.boolean().optional(),
  arrangementId: z.string().uuid().optional(),
  /** The lyrics version a published plan is pinned to; else the latest. */
  lyricsId: z.string().uuid().nullish(),
  /** The tempo this plan plays it at; else the arrangement's. */
  bpm: z.number().int().min(20).max(400).nullish(),
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
  if (!(await callerHasPermission(admin, caller, 'edit_order_of_service'))) {
    return jsonResponse({ error: 'You do not have permission to edit plans' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const body = parsed.data

  const configured = geminiConfigured()
  if (body.probe) return jsonResponse({ configured })
  if (!configured) {
    return jsonResponse({ configured: false, error: 'not_configured' }, 503)
  }
  if (!body.arrangementId) return jsonResponse({ error: 'No arrangement' }, 400)

  const { data: arrangement, error: arrangementError } = await admin
    .from('song_arrangements')
    .select('id, bpm, meter')
    .eq('id', body.arrangementId)
    .maybeSingle()
  if (arrangementError) return jsonResponse({ error: arrangementError.message }, 500)
  if (!arrangement) return jsonResponse({ error: 'Arrangement not found' }, 404)

  const bpm = body.bpm ?? arrangement.bpm
  if (!bpm) {
    return jsonResponse({ error: 'Give the song a BPM first — the length comes from it' }, 422)
  }

  // The pinned version if it belongs to this arrangement, else the latest.
  const lyricsQuery = admin
    .from('song_arrangement_lyrics')
    .select('lyrics, lyrics_chords')
    .eq('arrangement_id', arrangement.id)
  const { data: lyricsRow, error: lyricsError } = body.lyricsId
    ? await lyricsQuery.eq('id', body.lyricsId).maybeSingle()
    : await lyricsQuery.order('version', { ascending: false }).limit(1).maybeSingle()
  if (lyricsError) return jsonResponse({ error: lyricsError.message }, 500)
  const sections = lyricsRow ? playedSections(lyricsRow.lyrics, lyricsRow.lyrics_chords) : []
  if (sections.length === 0) {
    return jsonResponse({ error: 'This song has no lyrics or chords to time' }, 422)
  }

  const { data: links, error: linksError } = await admin
    .from('song_arrangement_songs')
    .select('sort_order, songs(title)')
    .eq('arrangement_id', arrangement.id)
    .order('sort_order')
  if (linksError) return jsonResponse({ error: linksError.message }, 500)
  const titles = (links ?? [])
    .map((l) => (l.songs as { title?: string } | null)?.title)
    .filter((t): t is string => !!t)

  try {
    const answer = await askForObject(
      lengthPrompt({ titles, bpm, meter: arrangement.meter, sections }),
      { label: 'estimate-song-length', thinkingLevel: 'low', schema: LENGTH_SCHEMA },
    )
    const timed = songSeconds(answer, sections.length, bpm, arrangement.meter)
    if (timed === null) {
      console.error('estimate-song-length: unusable answer', JSON.stringify(answer))
      return jsonResponse(
        { error: 'The bar count didn’t add up for this song — try again, or type the length' },
        502,
      )
    }
    return jsonResponse({
      songSeconds: timed.seconds,
      bars: timed.bars,
      changeSeconds: SONG_CHANGE_SECONDS,
      totalSeconds: planLength(timed.seconds),
      reasoning: typeof answer.reasoning === 'string' ? answer.reasoning.slice(0, 300) : '',
    })
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    throw error
  }
})
