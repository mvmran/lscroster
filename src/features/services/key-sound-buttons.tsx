import { AudioWaveform, Pause, Piano, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { songKeyTone } from '@/features/services/chord-notation'
import { MetronomeButton } from '@/features/services/metronome-button'
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

/**
 * The piano: a I–IV–V–I cadence in the key on a soft keyboard (one tap; ⏸
 * while it sounds, tap to stop). `songKey` is the key as written, e.g. "G#m".
 */
export function CadenceButton({ songKey }: { songKey: string | null }) {
  const { cadencePlaying, toggleCadence } = useKeySound(songKeyTone(songKey))
  const blocked = blockedReason(songKey)
  if (blocked && !cadencePlaying) {
    return <Blocked icon={Piano} label="Play the key" reason={blocked} />
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
      {cadencePlaying ? <Pause className="size-4 fill-current" /> : <Piano className="size-4" />}
    </Button>
  )
}

/** The waveform: a continuous pad on the key's full chord (⏸ while it plays). */
export function PadButton({ songKey }: { songKey: string | null }) {
  const { padPlaying, togglePad } = useKeySound(songKeyTone(songKey))
  const blocked = blockedReason(songKey)
  if (blocked && !padPlaying) {
    return <Blocked icon={AudioWaveform} label="Play a pad" reason={blocked} />
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
      {padPlaying ? (
        <Pause className="size-4 fill-current" />
      ) : (
        <AudioWaveform className="size-4" />
      )}
    </Button>
  )
}

/**
 * The trio wherever a song's sound is set — after Meter on the song page,
 * beside BPM in a plan's Edit song: pad, key riff, metronome, in that order.
 * The pad and the metronome can play together.
 */
export function SongSoundButtons({
  songKey,
  bpm,
  meter,
}: {
  songKey: string | null
  /** Null when there is no tempo, or the box isn't a whole number above 0. */
  bpm: number | null
  meter: string | null
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <PadButton songKey={songKey} />
      <CadenceButton songKey={songKey} />
      <MetronomeButton bpm={bpm} meter={meter} />
    </span>
  )
}
