// Pure helpers behind the `lyrics-assist` function.
//
// Three small jobs share one function because they share one key, one auth
// gate and one wire format: polish a transliteration, suggest a song's tags,
// and label a song's paragraphs as Verse / Chorus / Bridge. They live here,
// apart from the request handler, so `deno test` can exercise them without
// `Deno.serve` binding a port.
//
// Every one of them ends in an alignment step. The model is asked for a JSON
// array of a length the caller already knows, and the answer is forced back to
// exactly that length before it leaves the function: a model that miscounts
// must not be able to shift a song's line-parallel layers out of step, or hang
// a "Chorus" label on the wrong paragraph.

import { matchHeader } from './lyric-sections.ts'

/** Section keywords the labeller is allowed to use, in the order it sees them. */
const LABEL_VOCABULARY = [
  'Verse 1',
  'Verse 2',
  'Chorus',
  'Pre-Chorus',
  'Bridge',
  'Tag',
  'Intro',
  'Outro',
  'Refrain',
  'Instrumental',
]

/** At most this many tags come back, however generous the model feels. */
const MAX_TAGS = 6

/** A tag longer than this is a sentence, not a tag. */
const MAX_TAG_LENGTH = 24

// ---------------------------------------------------------------- polish ---

/**
 * Ask for a better transliteration than the scheme-based one.
 *
 * The offline romaniser in `transliterate.ts` is letter-accurate and never
 * idiomatic: it gives "mukhamonnumarthi" where a singer writes "mukhamonnu
 * marthi". The model sees both the original script and that draft, which is
 * what keeps this a correction rather than a fresh guess — and it is told to
 * leave a line alone when the draft is already right, so a line someone typed
 * by hand survives the pass.
 */
export function transliterationPrompt(
  language: string | null | undefined,
  native: string[],
  draft: string[],
): string {
  const named = language ? ` The song is in the language with ISO code "${language}".` : ''
  return [
    'You are helping a church worship team write a singable romanisation of a',
    `song written in another script.${named}`,
    '',
    'Each numbered line below gives the original script and the current',
    'romanised draft, which was produced letter by letter by a machine. Return',
    'a better romanisation of each line. Rules:',
    '- Return a JSON array of strings with exactly one entry per numbered line,',
    `  in the same order — ${native.length} lines in, ${native.length} entries out.`,
    '- Romanise the sound, never the meaning. This is a transliteration, not a',
    '  translation: the entry must still read as the original words.',
    '- Write it the way a singer would read it aloud: natural word breaks,',
    '  ordinary English spelling conventions, no diacritics or special symbols.',
    '- Keep the words in the order they are sung, one line in one line out.',
    '- Return the draft unchanged when it is already right.',
    '- Return an empty string for a line whose original is blank or is a section',
    '  header such as "Verse 1" or "Chorus".',
    '',
    ...native.map((line, i) => `${i + 1}. ${line}\n   draft: ${draft[i] ?? ''}`),
  ].join('\n')
}

/**
 * Force the polished lines back to the shape of the text being replaced.
 *
 * The draft is what a line falls back to, not the empty string: a line the
 * model skipped, or one that has no native text beside it — a blank row, the
 * second song of a medley typed in English — must come back exactly as it went
 * in. That makes the worst case "nothing changed" rather than "the lyrics pane
 * lost a verse".
 *
 * Section headers are kept whichever layer they appear in. They are structure,
 * not sound: the editor's pills, the flow strip and the projection API all
 * read them, and a "Verse 1" romanised into something else would take the
 * song's shape with it.
 */
export function alignTransliteration(
  entries: string[],
  native: string[],
  draft: string[],
): string[] {
  return draft.map((line, i) => {
    const source = native[i] ?? ''
    if (source.trim() === '') return line
    if (matchHeader(source) !== null || matchHeader(line) !== null) return line
    const entry = entries[i]
    return typeof entry === 'string' && entry.trim() !== '' ? entry.trim() : line
  })
}

// ------------------------------------------------------------------ tags ---

/**
 * Ask for the handful of words a worship leader would file this song under.
 *
 * `known` is the vocabulary the church already uses, which matters more than
 * it looks: without it every song gets its own near-synonym ("christmas",
 * "advent", "nativity") and the tag filter stops being a filter. The model is
 * told to reuse an existing tag wherever one fits and to coin sparingly.
 */
export function tagsPrompt(input: {
  title: string
  lyrics: string
  native: string
  known: string[]
}): string {
  const vocabulary = input.known.length
    ? [
        'Tags this church already uses — reuse one of these wherever it fits,',
        'spelled exactly as written here:',
        input.known.join(', '),
        '',
      ]
    : []
  return [
    'You are helping a church worship team file a song in their library.',
    '',
    `Suggest up to ${MAX_TAGS} short tags for the song below. Rules:`,
    '- Return a JSON array of strings and nothing else.',
    '- A tag is one or two lower-case words: a theme ("grace", "cross"), a',
    '  use ("opener", "communion", "christmas"), or a feel ("fast", "quiet").',
    '- Tag what the song is about and when it would be sung. Do not tag the',
    '  language, the key, the author, or that it is a worship song.',
    '- Prefer fewer, better tags. Return an empty array rather than padding.',
    '',
    ...vocabulary,
    `Title: ${input.title}`,
    '',
    'Lyrics:',
    input.lyrics,
    ...(input.native.trim() ? ['', 'The same song in its original script:', input.native] : []),
  ].join('\n')
}

/**
 * Clean the model's tags into ones this church can actually store.
 *
 * Casing follows the church, not the model: a suggestion that matches an
 * existing tag comes back spelled the way that tag is spelled, so "Christmas"
 * and "christmas" can never both end up in the library. Anything the song
 * already carries is dropped here rather than in the browser — this is a
 * suggestion list, and a suggestion you already took is noise.
 */
export function normalizeTags(
  entries: string[],
  known: string[],
  existing: string[],
): string[] {
  const canonical = new Map(known.map((tag) => [tag.toLowerCase(), tag]))
  const taken = new Set(existing.map((tag) => tag.toLowerCase()))
  const out: string[] = []
  for (const entry of entries) {
    // Commas would split one tag into two the moment the field is parsed.
    const cleaned = entry.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    if (cleaned === '' || cleaned.length > MAX_TAG_LENGTH) continue
    if (taken.has(cleaned)) continue
    taken.add(cleaned)
    out.push(canonical.get(cleaned) ?? cleaned)
    if (out.length === MAX_TAGS) break
  }
  return out
}

// -------------------------------------------------------------- sections ---

/**
 * Ask which paragraph is the chorus.
 *
 * Numbering verses is arithmetic and the app does it offline; telling a chorus
 * from a verse is not, and it is the whole reason this call exists. Repetition
 * is the signal — the paragraph that comes back twice is the chorus — so the
 * model is sent every paragraph in full rather than its opening line.
 */
export function sectionsPrompt(paragraphs: string[][]): string {
  return [
    'You are labelling the sections of a worship song.',
    '',
    'Each numbered block below is one paragraph of the song, in order. Give',
    'each paragraph its section label. Rules:',
    '- Return a JSON array of strings with exactly one entry per paragraph,',
    `  in the same order — ${paragraphs.length} paragraphs in,`,
    `  ${paragraphs.length} entries out.`,
    `- Use only these labels: ${LABEL_VOCABULARY.join(', ')} (and further`,
    '  numbered verses as needed). Nothing else is a valid answer.',
    '- The paragraph that repeats is the Chorus. Repeated paragraphs must all',
    '  get the same label.',
    '- Number the verses 1, 2, 3 … in the order they appear.',
    '- Return an empty string for a paragraph that is not a section of the',
    '  song — a title line at the top, a copyright line at the bottom.',
    '',
    ...paragraphs.map((lines, i) => `${i + 1}.\n${lines.join('\n')}\n`),
  ].join('\n')
}

/**
 * Force the labels back to one per paragraph, and to labels the app can parse.
 *
 * These strings are about to be written into someone's lyrics as header lines,
 * so anything the section grammar doesn't recognise is dropped to '' — an
 * unlabelled paragraph, exactly as it was — rather than typed in verbatim.
 * A recognised label comes back in the app's own spelling ("verse2" → "Verse
 * 2"), so the pills, the colours and the projection API all read it.
 */
export function alignLabels(entries: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const entry = entries[i]
    if (typeof entry !== 'string') return ''
    return matchHeader(entry)?.label ?? ''
  })
}
