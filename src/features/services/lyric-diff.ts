/**
 * What a lyrics pane holds that isn't saved yet, for the editor to mark: the
 * characters typed since the last save (shown in red once the pane loses
 * focus) and the lines touched in any way (a red bar at the pane's left edge,
 * a tick where a line was taken out altogether).
 *
 * Spaces never count. A line whose only change is spacing is unchanged, and a
 * blank line added or removed is no change at all — padding a layer out or
 * tidying a gap is not an edit anyone needs pointed out.
 *
 * Lines are matched first (so a line typed in the middle leaves the ones
 * after it alone), then, inside each run of changed lines, an old line and a
 * new one are paired in order and compared character by character.
 */

/** One draft line that differs from the saved text. */
export interface LineChange {
  /**
   * Half-open [start, end) ranges of characters in the draft line that the
   * saved line didn't have, spaces excluded. Empty when the line only lost
   * characters: then it shows the bar alone.
   */
  inserted: Array<[number, number]>
}

export interface TextDiff {
  /** Draft line index → how it differs. Lines not in it are as saved. */
  changed: Map<number, LineChange>
  /**
   * Draft line indexes a removed saved line used to sit just above — the
   * draft's line count for one removed from the end.
   */
  removedBefore: Set<number>
}

export const NO_DIFF: TextDiff = { changed: new Map(), removedBefore: new Set() }

/** Past this many cells a diff isn't worth its time; compare in place instead. */
const MAX_CELLS = 4_000_000

const squeeze = (line: string) => line.replace(/\s+/g, '')

/**
 * The longest common subsequence of two sequences, as index pairs in order.
 * Plain dynamic programming: songs are a few hundred lines of a few dozen
 * characters, well inside what a table handles in a keystroke.
 */
function commonPairs<T>(a: T[], b: T[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  const width = m + 1
  const table = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++
    else j++
  }
  return pairs
}

/** Collapse sorted character indexes into [start, end) runs. */
function toRanges(indexes: number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const at of indexes) {
    const last = ranges.at(-1)
    if (last && last[1] === at) last[1] = at + 1
    else ranges.push([at, at + 1])
  }
  return ranges
}

/** The non-space characters of a line, with where each sits in it. */
function letters(line: string): { chars: string[]; at: number[] } {
  const chars: string[] = []
  const at: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (!/\s/.test(line[i])) {
      chars.push(line[i])
      at.push(i)
    }
  }
  return { chars, at }
}

/** The characters `draft` has that `saved` doesn't, spaces aside. */
function insertedChars(saved: string, draft: string): Array<[number, number]> {
  const before = letters(saved)
  const after = letters(draft)
  if (before.chars.length * after.chars.length > MAX_CELLS) return toRanges(after.at)
  const kept = new Set(commonPairs(before.chars, after.chars).map(([, j]) => j))
  return toRanges(after.at.filter((_, j) => !kept.has(j)))
}

/** Compare a draft with what was saved; see the module comment for the rules. */
export function diffText(saved: string, draft: string): TextDiff {
  if (saved === draft) return NO_DIFF
  const before = saved.split(/\r?\n/)
  const after = draft.split(/\r?\n/)
  const beforeKeys = before.map(squeeze)
  const afterKeys = after.map(squeeze)
  const changed = new Map<number, LineChange>()
  const removedBefore = new Set<number>()

  // Too big to match (a pasted novel): compare line N with line N.
  const pairs =
    before.length * after.length > MAX_CELLS
      ? Array.from({ length: Math.min(before.length, after.length) }, (_, i) => [i, i])
          .filter(([i, j]) => beforeKeys[i] === afterKeys[j]) as Array<[number, number]>
      : commonPairs(beforeKeys, afterKeys)

  // Each run of unmatched lines between two matched ones is one hunk.
  let i = 0
  let j = 0
  for (const [nextI, nextJ] of [...pairs, [before.length, after.length]]) {
    // Blank lines carry nothing to mark, whichever side they're on.
    const gone = range(i, nextI).filter((k) => beforeKeys[k] !== '')
    const added = range(j, nextJ).filter((k) => afterKeys[k] !== '')
    // Paired in order with the lines that went; any left over are all new.
    added.forEach((k, n) => {
      const was = n < gone.length ? before[gone[n]] : ''
      changed.set(k, { inserted: insertedChars(was, after[k]) })
    })
    if (gone.length > added.length) removedBefore.add(nextJ)
    i = nextI + 1
    j = nextJ + 1
  }
  return { changed, removedBefore }
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k)
}

/** Whether a diff has anything to mark at all. */
export function hasChanges(diff: TextDiff): boolean {
  return diff.changed.size > 0 || diff.removedBefore.size > 0
}

/** Whether any line has characters to show in red. */
export function hasInserted(diff: TextDiff): boolean {
  for (const change of diff.changed.values()) if (change.inserted.length > 0) return true
  return false
}
