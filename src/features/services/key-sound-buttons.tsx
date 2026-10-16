import { AudioWaveform, Pause, Play, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { songKeyTone } from '@/features/services/chord-notation'
import { keySoundSupported } from '@/lib/key-sound'
import { useKeySound } from '@/lib/use-key-sound'

/** Why the key sounds can't play yet, or null when they can. */
function blockedReason(songKey: string | null): string | null {
  if (!keySoundSupported()) return 'This browser can’t play sound'
  if (!songKey?.trim()) return 'Add a key to hear it'
  if (!songKeyTone(songKey)) return 'Enter a key like G, Bb or F#m to hear it'
  return null
}

/** A greyed-out button whose hint says why — a disabled Button has
 * pointer-events: none, so the hint lives on a span. */
function Blocked({ icon: Icon, label, reason }: { icon: LucideIcon; label: string; reason: string }) {
  return (
    <span className="inline-flex shrink-0" title={reason}>
      <Button variant="outline" size="icon" disabled aria-label={label}>
        <Icon className="size-4" />
      </Button>
    </span>
  )
}

/** The idle icon, filled when it is the ▶ triangle; an outline icon (the
 * waveform, the piano) stays an outline. */
function Idle({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className={Icon === Play ? 'size-4 fill-current' : 'size-4'} />
}

/**
 * Plays a I–IV–V–I cadence in the key on a soft keyboard (one tap; ⏸ while it
 * sounds, tap to stop). `songKey` is the key as written, e.g. "G#m".
 */
export function CadenceButton({
  songKey,
  icon = Play,
}: {
  songKey: string | null
  icon?: LucideIcon
}) {
  const { cadencePlaying, toggleCadence } = useKeySound(songKeyTone(songKey))
  const blocked = blockedReason(songKey)
  if (blocked && !cadencePlaying) {
    return <Blocked icon={icon} label="Play the key" reason={blocked} />
  }
  // The key as the arrangement spells it: "G#m" stays G#m, not A♭ minor.
  const action = cadencePlaying ? 'Stop' : `Hear the key: I–IV–V–I in ${songKey?.trim() ?? ''}`
  return (
    <Button
      type="button"
      variant={cadencePlaying ? 'default' : 'outline'}
      size="icon"
      className="shrink-0"
      onClick={toggleCadence}
      aria-pressed={cadencePlaying}
      aria-label={action}
      title={action}
    >
      {cadencePlaying ? <Pause className="size-4 fill-current" /> : <Idle icon={icon} />}
    </Button>
  )
}

/** Toggles a continuous pad on the key's full chord (⏸ while it plays). */
export function PadButton({
  songKey,
  icon = AudioWaveform,
}: {
  songKey: string | null
  icon?: LucideIcon
}) {
  const { padPlaying, togglePad } = useKeySound(songKeyTone(songKey))
  const blocked = blockedReason(songKey)
  if (blocked && !padPlaying) {
    return <Blocked icon={icon} label="Play a pad" reason={blocked} />
  }
  const action = padPlaying ? 'Stop the pad' : `Play a pad in ${songKey?.trim() ?? ''}`
  return (
    <Button
      type="button"
      variant={padPlaying ? 'default' : 'outline'}
      size="icon"
      className="shrink-0"
      onClick={togglePad}
      aria-pressed={padPlaying}
      aria-label={action}
      title={action}
    >
      {padPlaying ? <Pause className="size-4 fill-current" /> : <Idle icon={icon} />}
    </Button>
  )
}

/**
 * The song page's pair beside an arrangement's Key: ▶ for the cadence, the
 * waveform for the pad. Both can run under the metronome.
 */
export function KeySoundButtons({ songKey }: { songKey: string | null }) {
  return (
    <span className="inline-flex shrink-0 gap-2">
      <CadenceButton songKey={songKey} />
      <PadButton songKey={songKey} />
    </span>
  )
}
