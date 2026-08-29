// The optional AI helpers around a song's lyrics (Gemini).
//
// Three jobs, one function, because they share everything that matters: the
// same key, the same admin/leader gate, and the same "draft it, a human saves
// it" contract.
//
//   transliteration — polish the machine romanisation of a native-script song
//   tags            — suggest library tags from what the song is about
//   sections        — label a song's paragraphs Verse 1 / Chorus / Bridge
//
// Optional per instance, exactly like `generate-meaning`: with no
// GEMINI_API_KEY every call answers `configured: false`, the buttons never
// appear, and the editor is the one the church has always had.
//
// Nothing here writes to the database. Every answer lands in an editor buffer
// and is stored only when someone presses Save changes.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { askForStrings, GeminiError, geminiConfigured } from '../_shared/gemini.ts'
import {
  alignLabels,
  alignTransliteration,
  normalizeTags,
  sectionsPrompt,
  tagsPrompt,
  transliterationPrompt,
} from '../_shared/lyrics-assist.ts'

/** Guard against a runaway paste: a long hymn is well under this. */
const MAX_LINES = 400

const schema = z.object({
  /** Probe for whether the feature is configured at all; no model call. */
  probe: z.boolean().optional(),
  task: z.enum(['transliteration', 'tags', 'sections']).optional(),
  /** transliteration: the original script, and the draft to improve on. */
  native: z.string().max(40_000).optional(),
  lyrics: z.string().max(40_000).optional(),
  /** ISO 639-1 code from `song_arrangement_lyrics.native_language`, if known. */
  language: z.string().max(8).nullish(),
  /** tags: the song, and the vocabulary the church already uses. */
  title: z.string().max(300).optional(),
  known: z.array(z.string().max(60)).max(400).optional(),
  existing: z.array(z.string().max(60)).max(50).optional(),
  /** sections: the song's paragraphs, blank lines already removed. */
  paragraphs: z.array(z.array(z.string().max(600)).max(80)).max(100).optional(),
})

const toLines = (text: string) => text.replace(/\r\n/g, '\n').split('\n')

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
  // Mirrors the `is_admin_or_leader()` RLS policy on songs and their lyrics:
  // whoever may edit a song may ask for help writing one down.
  if (caller.role !== 'admin' && caller.role !== 'leader') {
    return jsonResponse({ error: 'Only admins and leaders can edit songs' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const body = parsed.data

  const configured = geminiConfigured()
  if (body.probe) return jsonResponse({ configured })
  if (!configured) {
    // Not an error the user caused: the church has chosen not to enable it.
    return jsonResponse({ configured: false, error: 'not_configured' }, 503)
  }

  try {
    if (body.task === 'transliteration') {
      const native = toLines(body.native ?? '')
      const draft = toLines(body.lyrics ?? '')
      if ((body.native ?? '').trim() === '') {
        return jsonResponse({ error: 'No native text' }, 400)
      }
      if (Math.max(native.length, draft.length) > MAX_LINES) {
        return jsonResponse({ error: `More than ${MAX_LINES} lines` }, 413)
      }
      const entries = await askForStrings(
        transliterationPrompt(body.language, native, draft),
        'lyrics-assist/transliteration',
      )
      const lines = alignTransliteration(entries, native, draft)
      return jsonResponse({ lyrics: lines.join('\n'), lines: lines.length })
    }

    if (body.task === 'tags') {
      const lyrics = (body.lyrics ?? '').trim()
      const native = (body.native ?? '').trim()
      if (lyrics === '' && native === '') {
        return jsonResponse({ error: 'No lyrics to read' }, 400)
      }
      const entries = await askForStrings(
        tagsPrompt({
          title: body.title ?? '',
          lyrics,
          native,
          known: body.known ?? [],
        }),
        'lyrics-assist/tags',
      )
      return jsonResponse({
        tags: normalizeTags(entries, body.known ?? [], body.existing ?? []),
      })
    }

    if (body.task === 'sections') {
      const paragraphs = body.paragraphs ?? []
      if (paragraphs.length < 2) {
        // One paragraph is a song with no structure to find, and labelling it
        // "Verse 1" is structure in name alone.
        return jsonResponse({ error: 'Not enough paragraphs to label' }, 400)
      }
      const entries = await askForStrings(
        sectionsPrompt(paragraphs),
        'lyrics-assist/sections',
      )
      return jsonResponse({ labels: alignLabels(entries, paragraphs.length) })
    }
  } catch (error) {
    if (error instanceof GeminiError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    throw error
  }

  return jsonResponse({ error: 'Unknown task' }, 400)
})
