// Pure helpers behind the `generate-meaning` function.
//
// They live here, apart from the request handler, so `deno test` can exercise
// them without `Deno.serve` binding a port. They carry the invariant that
// matters: whatever the model returns, the meaning layer must come back with
// exactly one line per input line.

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

/**
 * Pull the model's text out of the response.
 *
 * The wire shape is `steps[].content[]` blocks of `{type:'text',text}`;
 * `output_text` is an SDK helper, not a field, though it is checked first in
 * case that changes. Only `model_output` steps are read: a response can carry
 * the `user_input` step as well, and sweeping up every text block anywhere in
 * the payload prepends the prompt to the answer and breaks the JSON parse.
 * `outputs` is the pre-May-2026 name for the same array.
 *
 * An unrecognised shape yields '' — which surfaces as a logged 502 rather than
 * a plausible-looking gloss built out of the wrong text.
 */
export function extractText(payload: unknown): string {
  const root = (payload ?? {}) as Record<string, unknown>
  if (typeof root.output_text === 'string') return root.output_text

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null

  const textOf = (content: unknown): string =>
    Array.isArray(content)
      ? content
          .filter(
            (block) =>
              isRecord(block) && block.type === 'text' && typeof block.text === 'string',
          )
          .map((block) => (block as { text: string }).text)
          .join('')
      : ''

  const steps = Array.isArray(root.steps)
    ? root.steps
    : Array.isArray(root.outputs)
      ? root.outputs
      : []
  return steps
    .filter((step) => isRecord(step) && step.type === 'model_output')
    .map((step) => textOf((step as Record<string, unknown>).content))
    .join('')
}

/** Force the model's array back to one entry per input line. */
export function alignToLines(entries: string[], lines: string[]): string[] {
  return lines.map((line, i) => {
    if (line.trim() === '') return ''
    const entry = entries[i]
    return typeof entry === 'string' ? entry.trim() : ''
  })
}
