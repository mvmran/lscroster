import { AudioWaveform, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { songKeyTone } from '@/features/services/chord-notation'
import { keySoundSupported } from '@/lib/key-sound'
import { useKeySound } from '@/lib/use-key-sound'

/**
 * Two buttons beside an arrangement's Key: ▶ plays a I–IV–V–I cadence in the
 * key (one tap; ⏸ while it sounds), and the waveform toggles a pad on the key's
 * full chord (⏸ while it plays). Both can run under the metronome.
 */
export function KeySoundButtons({ songKey }: { songKey: string | null }) {
  const tone = songKeyTone(songKey)
  const { cadencePlaying, padPlaying, toggleCadence, togglePad } = useKeySound(tone)

  const blocked = !keySoundSupported()
    ? 'This browser can’t play sound'
    : !songKey?.trim()
      ? 'Add a key to hear it'
      : !tone
        ? 'Enter a key like G, Bb or F#m to hear it'
        : null

  if (blocked && !cadencePlaying && !padPlaying) {
    return (
      // A disabled Button has pointer-events: none, so the hint lives on a span.
      <span className="inline-flex shrink-0 gap-2" title={blocked}>
        <Button variant="outline" size="icon" disabled aria-label="Play the key">
          <Play className="size-4" />
        </Button>
        <Button variant="outline" size="icon" disabled aria-label="Play a pad">
          <AudioWaveform className="size-4" />
        </Button>
      </span>
    )
  }

  // The key as the arrangement spells it: "G#m" stays G#m, not A♭ minor.
  const name = songKey?.trim() ?? ''
  const cadenceAction = cadencePlaying ? 'Stop' : `Hear the key: I–IV–V–I in ${name}`
  const padAction = padPlaying ? 'Stop the pad' : `Play a pad in ${name}`
  return (
    <span className="inline-flex shrink-0 gap-2">
      <Button
        type="button"
        variant={cadencePlaying ? 'default' : 'outline'}
        size="icon"
        onClick={toggleCadence}
        aria-pressed={cadencePlaying}
        aria-label={cadenceAction}
        title={cadenceAction}
      >
        {cadencePlaying ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 fill-current" />
        )}
      </Button>
      <Button
        type="button"
        variant={padPlaying ? 'default' : 'outline'}
        size="icon"
        onClick={togglePad}
        aria-pressed={padPlaying}
        aria-label={padAction}
        title={padAction}
      >
        {padPlaying ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <AudioWaveform className="size-4" />
        )}
      </Button>
    </span>
  )
}
