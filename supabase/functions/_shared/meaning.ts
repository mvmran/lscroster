// Pure helpers behind the `generate-meaning` function.
//
// They live here, apart from the request handler, so `deno test` can exercise
// them without `Deno.serve` binding a port. They carry the invariant that
// matters: whatever the model returns, the meaning layer must come back with
// exactly one line per input line.
//
// The wire-level plumbing moved to `gemini.ts` when a second function started
// calling the model; `extractText` is re-exported so its tests — and the
// invariant they guard — stay where the rest of this function's are.

export { extractText } from './gemini.ts'

export function buildPrompt(
  language: string | null | undefined,
  lines: string[],
): string {
  const named = language
    ? ` The lines are in the language with ISO code "${language}".`
    : ''
  return [
    'You are helping a church worship team understand a song in their own',
    `language.${named}`,
    '',
    'Give the plain English meaning of each numbered line below. Rules:',
    '- Return a JSON array of strings with exactly one entry per numbered line,',
    `  in the same order — ${lines.length} lines in, ${lines.length} entries out.`,
    '- An entry must be the meaning of that line alone. Do not merge lines,',
    '  split them, reorder them, or add commentary.',
    '- Return an empty string for a line that is blank, or that is a section',
    '  header such as "Verse 1" or "Chorus".',
    '- Translate the sense, not the sound. This is a translation, never a',
    '  transliteration: no romanised spelling of the original words.',
    '- Keep it natural and singable-plain, not literal word-for-word glossing.',
    '',
    ...lines.map((line, i) => `${i + 1}. ${line}`),
  ].join('\n')
}

/** Force the model's array back to one entry per input line. */
export function alignToLines(entries: string[], lines: string[]): string[] {
  return lines.map((line, i) => {
    if (line.trim() === '') return ''
    const entry = entries[i]
    return typeof entry === 'string' ? entry.trim() : ''
  })
}
