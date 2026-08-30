import { useSyncExternalStore } from 'react'
import { type ChordNotation } from '@/features/services/chord-notation'

/**
 * Which notation this person reads chords in — one choice, everywhere.
 *
 * A preference of the reader, not of the song or the plan: a musician who
 * thinks in numbers thinks in numbers for the whole library, so throwing the
 * switch on a lyrics sheet moves the one in the editor and the one on the
 * print controls with it. Nothing about the stored text changes either way —
 * chords are always stored as numbers of the key (`chord-notation`).
 *
 * It lives in `localStorage` rather than on the person's row because it is
 * worth nothing to anyone else and would cost a round trip to fetch, and in a
 * module-level store rather than React state because the copies of the control
 * are scattered across cards that share no parent — an external store keeps
 * them in step without threading a context through the plan page.
 *
 * **Numbers is the default.** The people who most need the chord sheet are the
 * ones who have played from the Nashville numbers for years; letters are one
 * click away for everyone who learnt the song from a chart online.
 */
const STORAGE_KEY = 'lscroster.chord-notation'

let current: ChordNotation | null = null
const listeners = new Set<() => void>()

function read(): ChordNotation {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'letters' ? 'letters' : 'numbers'
  } catch {
    // Private mode, or storage turned off. The default still applies.
    return 'numbers'
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Cached so the snapshot is referentially stable between changes. */
function getSnapshot(): ChordNotation {
  if (current === null) current = read()
  return current
}

export function setChordNotation(next: ChordNotation) {
  if (next === getSnapshot()) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not worth a message: the choice still holds for this session.
  }
  for (const listener of listeners) listener()
}

/**
 * The reader's notation, and a setter every copy of the control shares.
 *
 * The setter is the module-level function itself — already stable, so it needs
 * no memoising and never re-renders a child that takes it as a prop.
 */
export function useChordNotation(): [ChordNotation, (next: ChordNotation) => void] {
  const notation = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return [notation, setChordNotation]
}
