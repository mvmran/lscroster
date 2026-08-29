/**
 * Generate a singable Latin transliteration from native Indic script.
 *
 * A team that pastes a song in Malayalam alone has nothing to put in the base
 * layer, and the base must be Latin (`findNonLatinLyrics`) — so the import used
 * to dead-end: the native text landed in the base and the save was blocked.
 * This module produces a first draft of the transliteration instead.
 *
 * The draft is exactly that: deterministic scheme-based romanisation is close
 * but never idiomatic, so the result lands in the editor buffer for the team to
 * correct before saving, like any other edit. Nothing here is written to the
 * database.
 *
 * Scripts outside the Indic family (Cyrillic, CJK, Arabic …) are deliberately
 * not guessed at: `detectIndicScript` returns null, the caller leaves the base
 * empty, and the team types the transliteration themselves.
 */

/** A script we can romanise: how to detect it, and what to call it. */
export interface IndicScript {
  /** Sanscript's Brahmic scheme name. */
  scheme: string
  /** ISO 639-1 code for `song_arrangement_lyrics.native_language`. */
  language: string
  /** Unicode script property that identifies the text. */
  test: RegExp
  /**
   * Dravidian or Indo-Aryan, which decides two conventions. Dravidian scripts
   * write the dental stop `t` as "th" ("karathaaril", not "karataril") —
   * applying that to Devanagari would turn every Hindi "tum" into "thum".
   * Indo-Aryan scripts drop the inherent final vowel, so Hindi is "prem" and
   * "dharm" where Malayalam keeps its "-a".
   */
  dravidian: boolean
}

// Order matters only in that the first match wins; the ranges are disjoint.
// `tamil_extended` rather than `tamil`: the plain Tamil scheme reads the script
// as if it were Sanskrit and renders ப்ப as "bhbh" and ச as "jh". The extended
// one gives the correct "pp" and "c".
const SCRIPTS: IndicScript[] = [
  { scheme: 'malayalam', language: 'ml', test: /\p{Script=Malayalam}/u, dravidian: true },
  {
    scheme: 'tamil_extended',
    language: 'ta',
    test: /\p{Script=Tamil}/u,
    dravidian: true,
  },
  { scheme: 'telugu', language: 'te', test: /\p{Script=Telugu}/u, dravidian: true },
  { scheme: 'kannada', language: 'kn', test: /\p{Script=Kannada}/u, dravidian: true },
  // Devanagari carries Hindi, Marathi, Nepali and Sanskrit alike; 'hi' is the
  // likeliest for a church song library and the field is only a display hint.
  {
    scheme: 'devanagari',
    language: 'hi',
    test: /\p{Script=Devanagari}/u,
    dravidian: false,
  },
  { scheme: 'bengali', language: 'bn', test: /\p{Script=Bengali}/u, dravidian: false },
  { scheme: 'gujarati', language: 'gu', test: /\p{Script=Gujarati}/u, dravidian: false },
  { scheme: 'gurmukhi', language: 'pa', test: /\p{Script=Gurmukhi}/u, dravidian: false },
  { scheme: 'oriya', language: 'or', test: /\p{Script=Oriya}/u, dravidian: false },
  { scheme: 'sinhala', language: 'si', test: /\p{Script=Sinhala}/u, dravidian: false },
]

/** The script a native block is written in, or null if we can't romanise it. */
export function detectIndicScript(text: string): IndicScript | null {
  return SCRIPTS.find((script) => script.test.test(text)) ?? null
}

/**
 * The language code to store for a song's native layer.
 *
 * The editor has no language field — it is detected from the script instead.
 * An existing value always wins: a code already on the row (set by an earlier
 * save, or by hand) is never overwritten, so a correction sticks even if the
 * detector would disagree. Text in a script we don't romanise simply stays
 * null rather than being guessed at.
 */
export function resolveNativeLanguage(
  existing: string | null | undefined,
  native: string,
): string | null {
  return existing ?? detectIndicScript(native)?.language ?? null
}

/**
 * Malayalam chillu letters — a consonant with no inherent vowel, encoded
 * atomically rather than as consonant + virama, and word-final in most Kerala
 * spelling. Sanscript has no mapping for them and passes them through
 * untouched ("karathaariൽ"), so they are expanded first.
 */
const CHILLU: Record<string, string> = {
  'ൺ': 'ണ്', // ൺ → ണ്
  'ൻ': 'ന്', // ൻ → ന്
  'ർ': 'ര്', // ർ → ര്
  'ൽ': 'ല്', // ൽ → ല്
  'ൾ': 'ള്', // ൾ → ള്
  'ൿ': 'ക്', // ൿ → ക്
}

/**
 * Zero-width formatting characters, dropped before romanising.
 *
 * Malayalam has two encodings for a chillu: the atomic characters above, and
 * the older consonant + virama + ZWJ sequence that most existing song documents
 * are still written in. Sanscript maps neither the joiner nor the non-joiner,
 * so they survived into the generated Latin text — invisible in the editor, and
 * carried on into every export. They affect rendering only, never the sound, so
 * dropping them is safe: ന്‍ and ന് both romanise to a bare "n".
 *
 * Only the generated text is cleaned. The native layer keeps them, because it
 * is the team's own text and the joiners are what make it render correctly.
 */
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g

/**
 * Nukta consonants — क़ "qa", ज़ "za", ड़ "ṛa" — also have two encodings: one
 * precomposed character, or the base consonant plus a combining nukta. Only the
 * precomposed form is in sanscript's tables, and `normalize('NFC')` will not
 * produce it: every one of them sits on Unicode's composition-exclusion list,
 * so NFC leaves the pair alone and the nukta survives into the Latin text
 * ("taaka़ta" for ताक़त).
 *
 * The pairs are derived from the engine's own Unicode tables rather than typed
 * out here — each precomposed character's NFD decomposition is exactly the
 * sequence it should replace. Unassigned code points in these blocks decompose
 * to themselves and are skipped.
 */
const NUKTA_BLOCKS: Array<[number, number]> = [
  [0x0958, 0x095f], // Devanagari
  [0x09dc, 0x09df], // Bengali
  [0x0a59, 0x0a5e], // Gurmukhi
  [0x0b5c, 0x0b5d], // Oriya
]

const NUKTA = (() => {
  const pairs: Array<[string, string]> = []
  for (const [first, last] of NUKTA_BLOCKS) {
    for (let cp = first; cp <= last; cp += 1) {
      const composed = String.fromCodePoint(cp)
      const decomposed = composed.normalize('NFD')
      if (decomposed.length > 1) pairs.push([decomposed, composed])
    }
  }
  return {
    pattern: new RegExp(pairs.map(([decomposed]) => decomposed).join('|'), 'g'),
    composed: new Map(pairs),
  }
})()

/** Zero-width first, then nukta, then chillu: each step feeds the next. */
const normaliseNative = (text: string): string =>
  text
    .replace(ZERO_WIDTH, '')
    .replace(NUKTA.pattern, (match) => NUKTA.composed.get(match) ?? match)
    .replace(/[ൺ-ൿ]/g, (char) => CHILLU[char] ?? char)

/**
 * ISO 15919 digraphs that are already house style. Listed so the single-letter
 * rules below can't touch them — without this, mapping "t" to "th" would turn
 * the "th" of ഥ into "thh".
 */
// 'cch' (ച്ഛ, "acchan") is listed so the `cc` rule below can't cut it in half
// and leave a stray "h"; longest-match-first does the rest.
const KEEP = ['cch', 'kh', 'gh', 'ch', 'jh', 'ph', 'bh', 'th', 'dh', 'sh', 'ai', 'au']

/**
 * ISO 15919 → the ASCII romanisation the teams actually sing from: long vowels
 * doubled rather than macronned, retroflexes flattened, and the Malayalam
 * digraphs (ഴ "zh", ഞ "nj") spelled the Kerala way.
 */
const ASCII: Record<string, string> = {
  'ṭh': 'th',
  'ḍh': 'dh',
  'ññ': 'nj',
  'ṅk': 'nk',
  'ṅṅ': 'ng', // ങ്ങ — "angayepole", not "angngayepole"
  'cc': 'cch',
  'c': 'ch', // ച/च — "chollaan", "chalo"; ISO writes a bare "c"

  'ā': 'aa',
  'ī': 'ee',
  'ū': 'oo',
  'ē': 'e',
  'ō': 'o',
  'ṛ': 'ri',
  'ṝ': 'ri',
  'ḷ': 'l',
  'ḹ': 'l',
  'ṭ': 't',
  'ḍ': 'd',
  'ṇ': 'n',
  'ṅ': 'ng',
  'ñ': 'nj',
  'ś': 'sh',
  'ṣ': 'sh',
  'ḥ': 'h',
  'ṃ': 'm',
  'ṁ': 'm',
  'ḻ': 'zh',
  'ṟ': 'r',
  'ṉ': 'n',
  'ï': 'i',
  'ǣ': 'ae',
}

// Dental t → "th" and its geminate ത്ത → "tth", for Dravidian scripts only.
const DRAVIDIAN: Record<string, string> = { ...ASCII, tt: 'tth', t: 'th' }

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Drop the inherent final vowel, for Indo-Aryan scripts only.
 *
 * ISO 15919 spells out every inherent vowel, so मसीह comes back "masīha" and
 * ताक़त "tāqata" — but Hindi doesn't pronounce that last one, and nobody writes
 * it: "maseeh", "taaqat", "prem", "dharm". Dravidian languages *do* sound it
 * (Malayalam's "onnu", "karunaamayaa"), which is why this is opt-in.
 *
 * A single trailing "a" is the inherent vowel; "aa" is a real long ā and stays.
 * The vowel is kept when nothing but consonants would remain, so a one-syllable
 * "na" doesn't collapse to "n". Words containing a capital are skipped
 * altogether — romanised output is all lower case, so a capital means Latin
 * text the team typed into the line, and "Alleluia" must not become "Allelui".
 *
 * Medial schwa deletion (Hindi "kahta" for कहता) is a harder rule and is left
 * alone; the draft is corrected by a human either way.
 */
function dropFinalSchwa(text: string): string {
  return text.replace(/[A-Za-z]+/g, (word) => {
    if (/[A-Z]/.test(word)) return word
    if (!word.endsWith('a') || word.endsWith('aa')) return word
    const stem = word.slice(0, -1)
    return /[aeiou]/.test(stem) ? stem : word
  })
}

/** One pass, longest token first, so "ṭh" beats "ṭ" and KEEP beats everything. */
function toAscii(iso: string, dravidian: boolean): string {
  const table = dravidian ? DRAVIDIAN : ASCII
  const tokens = [...KEEP, ...Object.keys(table)].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(tokens.map(escapeRe).join('|'), 'g')
  return iso.replace(pattern, (match) =>
    KEEP.includes(match) ? match : (table[match] ?? match),
  )
}

/** Sanscript is ~340KB of scheme tables — only load it if a paste needs it. */
async function loadSanscript() {
  const module = await import('@indic-transliteration/sanscript')
  return (module.default ?? module) as {
    t: (text: string, from: string, to: string) => string
  }
}

/**
 * Romanise native text, line by line.
 *
 * Line-by-line matters: the layers are line-parallel, so the transliteration
 * must have exactly as many lines as the native text it came from — blank lines
 * included, or every layer below the first gap drifts out of step.
 */
export async function transliterate(
  native: string,
  script: IndicScript,
): Promise<string> {
  const sanscript = await loadSanscript()
  return native
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return ''
      const iso = sanscript.t(normaliseNative(line), script.scheme, 'iso')
      const ascii = toAscii(iso, script.dravidian)
      return script.dravidian ? ascii : dropFinalSchwa(ascii)
    })
    .join('\n')
}
