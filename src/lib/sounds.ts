import { stopCadence, stopPad } from '@/lib/key-sound'
import { stopMetronome } from '@/lib/metronome'

/**
 * Silence the cadence, the pad and the metronome, whoever started them. The
 * Lyrics Sheet's bubbles sound one song at a time, so a bubble calls this
 * before starting on a different song from the last; a song's own Pad and
 * Click play together.
 */
export function stopAllSounds() {
  stopCadence()
  stopPad()
  stopMetronome()
}
