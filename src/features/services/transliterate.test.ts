import { describe, expect, it } from 'vitest'
import {
  detectIndicScript,
  resolveNativeLanguage,
  transliterate,
} from '@/features/services/transliterate'

const romanise = async (native: string) => {
  const script = detectIndicScript(native)
  if (!script) throw new Error('no script detected')
  return transliterate(native, script)
}

describe('detectIndicScript', () => {
  it('names the script and its language code', () => {
    expect(detectIndicScript('ആ കരതാരിൽ')).toMatchObject({
      scheme: 'malayalam',
      language: 'ml',
    })
    expect(detectIndicScript('यीशु मसीह')).toMatchObject({
      scheme: 'devanagari',
      language: 'hi',
    })
    // The plain `tamil` scheme reads the script as Sanskrit; the extended one
    // is the reason ப்ப comes out "pp" rather than "bhbh".
    expect(detectIndicScript('இயேசு')).toMatchObject({ scheme: 'tamil_extended' })
  })

  it('returns null for Latin and for scripts we do not romanise', () => {
    expect(detectIndicScript('Amazing grace')).toBeNull()
    expect(detectIndicScript('')).toBeNull()
    expect(detectIndicScript('Слава Богу')).toBeNull() // Cyrillic
    expect(detectIndicScript('恵み')).toBeNull() // Han
    expect(detectIndicScript('은혜')).toBeNull() // Hangul
  })
})

describe('transliterate', () => {
  it('romanises Malayalam in the house style', async () => {
    // The team's own spelling of this line is "aa karathaaril …": long vowels
    // doubled, and the dental ത written "th".
    expect(await romanise('ആ കരതാരിൽ')).toBe('aa karathaaril')
  })

  it('expands chillu letters instead of passing them through', async () => {
    // ൽ ൻ ർ ൺ ൾ are encoded atomically and sanscript has no mapping for them,
    // so without expansion they survive verbatim into the "Latin" base text.
    const out = await romanise('കാൽവറി കരയാൻ മർത്തി')
    expect(out).not.toMatch(/[ൺ-ൿ]/)
    expect(out).toBe('kaalvari karayaan martthi')
  })

  it('drops the zero-width joiners of legacy chillu encoding', async () => {
    // Most existing song documents write a chillu as consonant + virama + ZWJ
    // rather than as the atomic character. Sanscript maps neither joiner, so
    // they used to survive into the base — invisible there, but carried into
    // the projection API, the PDF sheets and every other export.
    const legacy = 'എന്\u200d\u200d\u200d ജീവനേക്കാളും നീ'
    const out = await romanise(legacy)
    expect(out).toBe('en jeevanekkaalum nee')
    expect(out).not.toMatch(/[\u200B-\u200D\uFEFF]/)
  })

  it('writes the Malayalam digraphs the Kerala way', async () => {
    expect(await romanise('കഴിഞ്ഞു')).toBe('kazhinju') // ഴ zh, ഞ്ഞ nj
  })

  it('composes a nukta written as base consonant + combining mark', async () => {
    // ताक़त as क + U+093C rather than the precomposed क़ (U+0958). Only the
    // precomposed form is in sanscript's tables, and NFC will not produce it —
    // these characters are composition-excluded — so the nukta used to survive
    // into the Latin text as "taaka़ta".
    const out = await romanise('तू मेरी ताक़त है')
    expect(out).toBe('too meree taaqata hai')
    expect(out).not.toMatch(/\p{Script=Devanagari}/u)
  })

  it('reads the precomposed nukta character identically', () => {
    // Escapes, not literals: a Devanagari literal in this file is liable to be
    // normalised back to the combining form, which would make the two sides
    // identical and the comparison vacuous.
    const combining = '\u0924\u093E\u0915\u093C\u0924' // त ा क + nukta त
    const precomposed = '\u0924\u093E\u0958\u0924' // त ा क़ त
    expect(combining).not.toBe(precomposed)
    return Promise.all([romanise(combining), romanise(precomposed)]).then(
      ([a, b]) => {
        expect(a).toBe(b)
        expect(a).toBe('taaqata')
      },
    )
  })

  it('leaves Devanagari dentals alone', async () => {
    // "th" for a dental t is a Dravidian convention; applying it to Hindi would
    // turn every "tum" into "thum".
    expect(await romanise('यीशु मसीह प्रभु')).toBe('yeeshu maseeha prabhu')
  })

  it('keeps the line count exactly, blank lines included', async () => {
    const native = 'ആ കരതാരിൽ\n\nകാൽവറി\nനാഥാ'
    const out = await transliterate(native, detectIndicScript(native)!)
    expect(out.split('\n')).toHaveLength(4)
    expect(out.split('\n')[1]).toBe('')
  })

  it('does not mangle Latin text mixed into a native line', async () => {
    expect(await romanise('ആ (Verse 1)')).toBe('aa (Verse 1)')
  })
})

describe('resolveNativeLanguage', () => {
  it('detects the code from the native layer', () => {
    expect(resolveNativeLanguage(null, 'ആ കരതാരിൽ')).toBe('ml')
    expect(resolveNativeLanguage(undefined, 'यीशु मसीह')).toBe('hi')
  })

  it('never overwrites a code already on the row', () => {
    // A hand-set 'mr' (Marathi, also Devanagari) must survive a save that
    // would otherwise detect 'hi'.
    expect(resolveNativeLanguage('mr', 'यीशु मसीह')).toBe('mr')
  })

  it('stays null rather than guessing', () => {
    expect(resolveNativeLanguage(null, '')).toBeNull()
    expect(resolveNativeLanguage(null, 'Amazing grace')).toBeNull()
    expect(resolveNativeLanguage(null, 'Слава Богу')).toBeNull()
  })
})
