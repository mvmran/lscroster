import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  clickPattern,
  metronomeOwner,
  startMetronome,
  stopMetronome,
  subscribeMetronome,
  updateMetronome,
} from '@/lib/metronome'

/**
 * A metronome for one control. It follows `bpm` and `meter` live while playing
 * (stopping if the tempo is cleared), and stops when the component that owns it
 * goes away — leaving the page, or switching to another arrangement's tab.
 */
export function useMetronome(bpm: number | null, meter: string | null) {
  const [id] = useState(() => Symbol('metronome'))
  const playing = useSyncExternalStore(subscribeMetronome, metronomeOwner) === id
  const pattern = useMemo(() => clickPattern(meter), [meter])

  useEffect(() => {
    if (!playing) return
    if (bpm === null) stopMetronome(id)
    else updateMetronome(id, bpm, pattern)
  }, [id, playing, bpm, pattern])

  useEffect(() => () => stopMetronome(id), [id])

  function toggle() {
    if (playing) stopMetronome(id)
    else if (bpm !== null) startMetronome(id, bpm, pattern)
  }

  return { playing, toggle }
}
