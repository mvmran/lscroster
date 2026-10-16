import { useState } from 'react'

/**
 * The Lyrics Sheet's **Long Lyrics** switch: every section each time it is
 * sung, rather than each section once with the song's sequence saying how it
 * goes. Off by default — the short sheet is what most people sing from.
 *
 * A preference of the reader, kept in this browser like the chord notation
 * (`use-chord-notation`): worth nothing to anyone else, and not worth a round
 * trip. Storage can be missing or refuse (private mode, blocked site data), in
 * which case the switch still works for the visit.
 */
const STORAGE_KEY = 'lscroster.long-lyrics'

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function useLongLyrics(): [boolean, (next: boolean) => void] {
  const [on, setOn] = useState(read)
  function set(next: boolean) {
    setOn(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      // Not worth a message: the choice still holds until the page is left.
    }
  }
  return [on, set]
}
