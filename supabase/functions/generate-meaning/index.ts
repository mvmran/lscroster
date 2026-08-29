// Draft the English meaning layer from a song's native script (Gemini).
//
// Optional: a church that doesn't want an AI bill simply never sets
// GEMINI_API_KEY, and every call answers `configured: false` so the editor
// hides the button. Nothing else in the app depends on it.
//
// The key lives here rather than in the browser — that is the whole reason this
// is a function and not a fetch from the client.
//
// The layers are line-parallel: line N of the meaning belongs to line N of the
// lyrics. The model is therefore asked for one array entry per input line, and
// the result is forced back to exactly that shape before it is returned, so a
// model that miscounts can't quietly shift a song's layers out of step.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { alignToLines, buildPrompt, extractText } from '../_shared/meaning.ts'

// The Interactions API; `generation_config.thinking_level` is "minimal" because
// this model cannot turn thinking off entirely, and a line-by-line gloss is the
// kind of work that gains nothing from deliberation.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

/** Guard against a runaway paste: a long hymn is well under this. */
const MAX_LINES = 400

const schema = z.object({
  /** Probe for whether the feature is configured at all; no model call. */
  probe: z.boolean().optional(),
  native: z.string().max(40_000).optional(),
  /** ISO 639-1 code from `song_arrangement_lyrics.native_language`, if known. */
  language: z.string().max(8).nullish(),
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
  // Mirrors the `is_admin_or_leader()` RLS policy on song_arrangement_lyrics:
  // whoever may edit the lyrics may draft a meaning for them.
  if (caller.role !== 'admin' && caller.role !== 'leader') {
    return jsonResponse({ error: 'Only admins and leaders can edit lyrics' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (parsed.data.probe) return jsonResponse({ configured: Boolean(apiKey) })
  if (!apiKey) {
    // Not an error the user caused: the church has chosen not to enable it.
    return jsonResponse({ configured: false, error: 'not_configured' }, 503)
  }

  const native = parsed.data.native ?? ''
  if (native.trim() === '') return jsonResponse({ error: 'No native text' }, 400)
  const lines = native.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > MAX_LINES) {
    return jsonResponse({ error: `More than ${MAX_LINES} lines` }, 413)
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL,
        input: buildPrompt(parsed.data.language, lines),
        generation_config: { thinking_level: 'minimal' },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: { type: 'array', items: { type: 'string' } },
        },
      }),
    })
  } catch (error) {
    console.error('generate-meaning: request failed', error)
    return jsonResponse({ error: 'Could not reach the translation service' }, 502)
  }

  if (!response.ok) {
    // The body carries Google's own reason (bad key, quota, model name); it is
    // logged for the admin and not returned, since it can name the model.
    console.error('generate-meaning: HTTP', response.status, await response.text())
    return jsonResponse({ error: `Translation service returned ${response.status}` }, 502)
  }

  // Structured output should be bare JSON, but a fenced block costs one line
  // to survive and a whole call to fail on.
  const text = extractText(await response.json())
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
  let entries: unknown
  try {
    entries = JSON.parse(text)
  } catch {
    console.error('generate-meaning: response was not JSON:', text.slice(0, 500))
    return jsonResponse({ error: 'Translation service returned no usable text' }, 502)
  }
  if (!Array.isArray(entries)) {
    return jsonResponse({ error: 'Translation service returned no usable text' }, 502)
  }

  const meaning = alignToLines(
    entries.map((entry) => (typeof entry === 'string' ? entry : '')),
    lines,
  )
  return jsonResponse({ meaning: meaning.join('\n'), lines: meaning.length })
})
