// The one place this app talks to Gemini.
//
// Two functions call a model — `generate-meaning` and `lyrics-assist` — and
// both want the same four things: the key whose presence switches the feature
// on, the request shape the Interactions API expects, the model's text pulled
// back out of a nested payload, and a JSON array of strings parsed from it.
// Sharing them means a change to Google's wire format is one edit, not a hunt.
//
// The key is read from the environment here and never returned to a caller: a
// caller asks whether the feature is configured, never what the key is.

// `generation_config.thinking_level` is "minimal" because this model cannot
// turn thinking off entirely, and none of the work here — a line-by-line
// gloss, a handful of tags, a section label — gains anything from deliberation.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

/** Whether this instance has the optional AI features switched on. */
export function geminiConfigured(): boolean {
  return Boolean(Deno.env.get('GEMINI_API_KEY'))
}

/**
 * A failure that already knows what HTTP status it deserves.
 *
 * `message` is written to be read by a person in a toast. Google's own wording
 * is logged rather than returned: it can name the model and the key's quota.
 */
export class GeminiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
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
 * a plausible-looking answer built out of the wrong text.
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

/**
 * Read a JSON array of strings out of the model's answer.
 *
 * Structured output should be bare JSON, but a fenced block costs one line to
 * survive and a whole call to fail on. Anything in the array that is not a
 * string becomes '' rather than sinking the call — the callers all align the
 * result to a length they already know, and an empty entry is a blank line or
 * a dropped tag, which is recoverable where a 502 is not.
 */
export function parseStringArray(text: string): string[] | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!Array.isArray(value)) return null
  return value.map((entry) => (typeof entry === 'string' ? entry : ''))
}

/**
 * Ask the model one question and get a JSON array of strings back.
 *
 * `label` names the caller in the server log so a failure can be traced to the
 * feature that caused it. Every failure path throws a `GeminiError`, so a
 * handler turns the whole call into a response with one catch.
 */
export async function askForStrings(prompt: string, label: string): Promise<string[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new GeminiError(503, 'not_configured')

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL,
        input: prompt,
        generation_config: { thinking_level: 'minimal' },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: { type: 'array', items: { type: 'string' } },
        },
      }),
    })
  } catch (error) {
    console.error(`${label}: request failed`, error)
    throw new GeminiError(502, 'Could not reach the language service')
  }

  if (!response.ok) {
    console.error(`${label}: HTTP`, response.status, await response.text())
    throw new GeminiError(502, `Language service returned ${response.status}`)
  }

  const text = extractText(await response.json())
  const entries = parseStringArray(text)
  if (entries === null) {
    console.error(`${label}: response was not a JSON array:`, text.slice(0, 500))
    throw new GeminiError(502, 'Language service returned no usable text')
  }
  return entries
}
