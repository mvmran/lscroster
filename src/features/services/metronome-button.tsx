import { Metronome, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClickLevel } from '@/features/settings/use-pad-settings'
import {
  METRONOME_MAX_BPM,
  METRONOME_MIN_BPM,
  metronomeSupported,
  parseMeter,
} from '@/lib/metronome'
import { useMetronome } from '@/lib/use-metronome'

/**
 * The metronome (⏸ while playing): a click at the tempo, accented by the meter
 * when there is one, a plain click when there isn't. `bpm` is null when the box
 * is empty or not a whole number above 0. It plays at the person's own click
 * volume (Settings → Sounds).
 */
export function MetronomeButton({ bpm, meter }: { bpm: number | null; meter: string | null }) {
  const { level } = useClickLevel()
  const { playing, toggle } = useMetronome(bpm, meter, level)
  const meterLabel = parseMeter(meter) ? meter?.replace(/\s+/g, '') : null

  const blocked = !metronomeSupported()
    ? 'This browser can’t play the metronome'
    : bpm === null
      ? 'Add a BPM to play a metronome'
      : bpm < METRONOME_MIN_BPM || bpm > METRONOME_MAX_BPM
        ? `The metronome plays ${METRONOME_MIN_BPM}–${METRONOME_MAX_BPM} BPM`
        : null

  if (blocked && !playing) {
    return (
      // A disabled Button has pointer-events: none, so the hint lives on a span.
      <span className="inline-flex shrink-0" title={blocked}>
        <Button variant="outline" size="icon" disabled aria-label="Play metronome">
          <Metronome className="size-4" />
        </Button>
      </span>
    )
  }

  const action = playing
    ? 'Stop the metronome'
    : meterLabel
      ? `Play a metronome: ${bpm} BPM in ${meterLabel}`
      : `Play a metronome: ${bpm} BPM`
  return (
    <Button
      type="button"
      variant={playing ? 'default' : 'outline'}
      size="icon"
      className="shrink-0"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={action}
      title={action}
    >
      {playing ? (
        <Pause className="size-4 fill-current" />
      ) : (
        <Metronome className="size-4" />
      )}
    </Button>
  )
}
