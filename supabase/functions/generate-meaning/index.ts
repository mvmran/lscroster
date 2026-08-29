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
import { askForStrings, GeminiError, geminiConfigured } from '../_shared/gemini.ts'
import { alignToLines, buildPrompt } from '../_shared/meaning.ts'

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

  const configured = geminiConfigured()
  if (parsed.data.probe) return jsonResponse({ configured })
  if (!configured) {
    // Not an error the user caused: the church has chosen not to enable it.
    return jsonResponse({ configured: false, error: 'not_configured' }, 503)
  }

  const native = parsed.data.native ?? ''
  if (native.trim() === '') return jsonResponse({ error: 'No native text' }, 400)
  const lines = native.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > MAX_LINES) {
    return jsonResponse({ error: `More than ${MAX_LINES} lines` }, 413)
  }

  let entries: string[]
  try {
    entries = await askForStrings(
      buildPrompt(parsed.data.language, lines),
      'generate-meaning',
    )
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    throw error
  }

  const meaning = alignToLines(entries, lines)
  return jsonResponse({ meaning: meaning.join('\n'), lines: meaning.length })
})
