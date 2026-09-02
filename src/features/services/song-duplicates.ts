import { type Song } from '@/features/services/service-utils'

/**
 * Finding the song you are about to add again under a slightly different name.
 *
 * An exact title match catches almost nothing worth catching. The duplicates
 * that actually reach the library are near misses: the same song typed with a
 * qualifier ("Amazing Grace" / "Amazing Grace (slow)"), and — the reason this
 * exists — the same Malayalam or Tamil song romanised two different ways.
 * "Ezhu Vilakkin Naduvil" and "Ezhu Vlakkin Naduvil" are one song; nothing
 * about the strings says so, and a leader adding the second one has no way to
 * know the first is already there.
 *
 * So this is deliberately loose, and its answer is a **warning, never a block**.
 * It will flag "Amazing Grace" against "Amazing Grace (My Chains Are Gone)",
 * which are two different songs — that is the intended trade. The person
 * adding the song can see both titles and decide; a matcher tight enough to
 * never do that would miss the transliteration cases it is here for.
 */

/**
 * Lowercase, unaccented, punctuation-free words.
 *
 * NFD splits an accented letter into letter + combining mark so the marks can
 * be dropped, which folds "Sanctíssima" onto "sanctissima". Everything that is
 * not a letter or digit becomes a space, so "Holy, Holy, Holy" and
 * "Holy Holy Holy" are the same string by the time they are compared.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
}

/**
 * The title with its trailing qualifier removed — "(slow)", "[live]", the
 * "- acoustic" that people append to mark an arrangement rather than a
 * different song. Falls back to the whole title when a title is nothing but a
 * qualifier, so `coreTitle('(Reprise)')` is not empty.
 */
export function coreTitle(title: string): string {
  const stripped = title.replace(/[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s[-–—]\s.*$/, ' ')
  const core = normalizeTitle(stripped)
  return core === '' ? normalizeTitle(title) : core
}

/**
 * Fold the spelling choices that separate two romanisations of one word.
 *
 * Whoever types the title picks, every time and without a rule: whether the
 * aspirated consonant keeps its `h` (nadha / nada), whether a long vowel or a
 * doubled consonant is written twice (yesuvee / yesuve), and `v` or `w`. None
 * of those change the word in the original script, so all three are collapsed
 * before the titles are compared. Digits are left alone — "10 000 Reasons"
 * must not fold to "10 0 Reasons".
 */
export function foldRoman(normalized: string): string {
  return normalized
    .replace(/([bcdgjkpstz])h/g, '$1')
    .replace(/w/g, 'v')
    .replace(/([\p{Letter}])\1+/gu, '$1')
}

function tokensOf(folded: string): string[] {
  return folded === '' ? [] : folded.split(' ')
}

/** Levenshtein distance, two rows rather than the full matrix. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a === '') return b.length
  if (b === '') return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitute = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      row[j] = Math.min(substitute, prev[j] + 1, row[j - 1] + 1)
    }
    prev = row
  }
  return prev[b.length]
}

/** Is every word of the shorter title also a word of the longer one? */
function isTokenSubset(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [tokensOf(a), tokensOf(b)] : [tokensOf(b), tokensOf(a)]
  // One word in common is not a resemblance — "Come" is inside "Come Thou
  // Fount", and so is half the library.
  if (short.length < 2 || short.length === long.length) return false
  const words = new Set(long)
  return short.every((word) => words.has(word))
}

/**
 * How alike two song titles are, from 0 (nothing) to 1 (the same title).
 *
 * The tiers above `SIMILAR_ENOUGH` are the cases worth naming: same title,
 * same title bar a qualifier, same title bar romanisation. Everything else
 * falls through to edit distance over the folded titles, which is what catches
 * a dropped or doubled letter in a long transliteration.
 */
export function titleSimilarity(a: string, b: string): number {
  const normalizedA = normalizeTitle(a)
  const normalizedB = normalizeTitle(b)
  if (normalizedA === '' || normalizedB === '') return 0
  if (normalizedA === normalizedB) return 1

  const coreA = coreTitle(a)
  const coreB = coreTitle(b)
  if (coreA === coreB) return 0.97

  const foldedA = foldRoman(coreA)
  const foldedB = foldRoman(coreB)
  if (foldedA === foldedB) return 0.95
  if (isTokenSubset(foldedA, foldedB)) return 0.9

  const longest = Math.max(foldedA.length, foldedB.length)
  return 1 - editDistance(foldedA, foldedB) / longest
}

/**
 * The bar for showing the warning.
 *
 * Set from the transliteration cases, which are the point: one dropped letter
 * in a twenty-character title has to clear it, while "Amazing Grace" against
 * "Amazing Love" must not.
 */
export const SIMILAR_ENOUGH = 0.85

/** How many near misses a warning names before falling back to a count. */
export const MAX_SIMILAR_SHOWN = 4

/** A song already in the library that looks like the one being added. */
export interface SimilarSong {
  song: Song
  score: number
}

/**
 * Songs whose titles are close enough to `title` to be worth a warning, best
 * match first. Archived songs are included on purpose — a song that was
 * archived rather than deleted is exactly the one about to be added twice.
 */
export function findSimilarSongs(title: string, songs: Song[]): SimilarSong[] {
  if (normalizeTitle(title) === '') return []
  return songs
    .map((song) => ({ song, score: titleSimilarity(title, song.title) }))
    .filter((match) => match.score >= SIMILAR_ENOUGH)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title))
}
