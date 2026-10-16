import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  cadenceOwner,
  padOwner,
  playCadence,
  startPad,
  stopCadence,
  stopPad,
  subscribeKeySound,
  type KeyTone,
} from '@/lib/key-sound'

/**
 * The cadence and pad for one control. A key edit stops the cadence and
 * retunes a playing pad — G to Gm included, the pad holds the 3rd — or
 * silences it when the key is cleared. Both stop when the component that owns
 * them goes away — leaving the page, or switching to another arrangement's tab.
 */
export function useKeySound(tone: KeyTone | null) {
  const [id] = useState(() => Symbol('key-sound'))
  const cadencePlaying = useSyncExternalStore(subscribeKeySound, cadenceOwner) === id
  const padPlaying = useSyncExternalStore(subscribeKeySound, padOwner) === id
  const tonic = tone?.tonic ?? null
  const minor = tone?.minor ?? false

  const last = useRef({ tonic, minor })
  useEffect(() => {
    const before = last.current
    if (before.tonic === tonic && before.minor === minor) return
    last.current = { tonic, minor }
    stopCadence(id)
    if (padOwner() !== id) return
    if (tonic === null) stopPad(id)
    else startPad(id, { tonic, minor })
  }, [id, tonic, minor])

  useEffect(
    () => () => {
      stopCadence(id)
      stopPad(id)
    },
    [id],
  )

  function toggleCadence() {
    if (cadencePlaying) stopCadence(id)
    else if (tone) playCadence(id, tone)
  }

  function togglePad() {
    if (padPlaying) stopPad(id)
    else if (tone) startPad(id, tone)
  }

  return { cadencePlaying, padPlaying, toggleCadence, togglePad }
}
