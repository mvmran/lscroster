/**
 * The optional AI helpers around a song (`generate-meaning`, `lyrics-assist`).
 *
 * Optional per instance: a church that hasn't set GEMINI_API_KEY gets
 * `configured: false` from the probe, and the UI simply never offers the
 * button. Nothing here is required for the song page to work — every one of
 * these is a shortcut past typing something by hand.
 *
 * Every answer lands in an editor buffer and is written only when a person
 * presses Save changes. None of these hooks touch the database.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/functions'

/**
 * Whether one of the AI functions is switched on for this instance.
 *
 * One cheap probe per function per session — each answers without calling the
 * model. `false` on any failure: a church without the feature should see the
 * app it has always had, never an error about something it never enabled.
 * That also covers the upgrade window, where the new bundle can reach a
 * project whose functions haven't been redeployed yet.
 */
function useFunctionAvailable(name: string, enabled = true) {
  return useQuery({
    queryKey: ['ai-function-available', name],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        const data = await invokeFunction<{ configured: boolean }>(name, {
          probe: true,
        })
        return data.configured === true
      } catch {
        return false
      }
    },
  })
}

/** Whether the meaning layer can be drafted (`generate-meaning`). */
export function useMeaningGenerationAvailable(enabled = true) {
  return useFunctionAvailable('generate-meaning', enabled)
}

/** Whether tags, sections and transliteration help are on (`lyrics-assist`). */
export function useLyricsAssistAvailable(enabled = true) {
  return useFunctionAvailable('lyrics-assist', enabled)
}

/** Draft an English meaning, line-parallel to the native text it came from. */
export function useGenerateMeaning() {
  return useMutation({
    mutationFn: async ({
      native,
      language,
    }: {
      native: string
      language: string | null
    }) => {
      const data = await invokeFunction<{ meaning: string }>('generate-meaning', {
        native,
        language,
      })
      return data.meaning
    },
  })
}

/**
 * Rewrite the singable Latin text from the native script beside it.
 *
 * The offline romaniser gets every letter right and the word breaks wrong;
 * this reads both texts and returns the version a singer would read aloud. It
 * comes back line for line, so the layers stay parallel.
 */
export function usePolishTransliteration() {
  return useMutation({
    mutationFn: async ({
      native,
      lyrics,
      language,
    }: {
      native: string
      lyrics: string
      language: string | null
    }) => {
      const data = await invokeFunction<{ lyrics: string }>('lyrics-assist', {
        task: 'transliteration',
        native,
        lyrics,
        language,
      })
      return data.lyrics
    },
  })
}

/**
 * Suggest library tags for a song.
 *
 * `known` is the vocabulary already in use across the library and `existing`
 * is what this song already carries — the function spells a suggestion the way
 * the church spells it and leaves out the ones already taken, so the caller
 * only ever has new tags to add.
 */
export function useSuggestTags() {
  return useMutation({
    mutationFn: async ({
      title,
      lyrics,
      native,
      known,
      existing,
    }: {
      title: string
      lyrics: string
      native: string
      known: string[]
      existing: string[]
    }) => {
      const data = await invokeFunction<{ tags: string[] }>('lyrics-assist', {
        task: 'tags',
        title,
        lyrics,
        native,
        known,
        existing,
      })
      return data.tags
    },
  })
}

/**
 * Label a song's paragraphs — Verse 1, Chorus, Bridge.
 *
 * Numbering verses is arithmetic the import does offline; telling a chorus
 * from a verse needs a reader. One label comes back per paragraph sent, blank
 * for a paragraph that is not a section (a title line, a copyright line).
 */
export function useSuggestSections() {
  return useMutation({
    mutationFn: async ({ paragraphs }: { paragraphs: string[][] }) => {
      const data = await invokeFunction<{ labels: string[] }>('lyrics-assist', {
        task: 'sections',
        paragraphs,
      })
      return data.labels
    },
  })
}
