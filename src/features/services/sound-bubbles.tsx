import { AudioWaveform, Metronome, Pause } from 'lucide-react'
import { songKeyTone } from '@/features/services/chord-notation'
import { cn } from '@/lib/utils'
import { keySoundSupported } from '@/lib/key-sound'
import {
  METRONOME_MAX_BPM,
  METRONOME_MIN_BPM,
  metronomeSupported,
  parseMeter,
} from '@/lib/metronome'
import { stopAllSounds } from '@/lib/sounds'
import { useKeySound } from '@/lib/use-key-sound'
import { useMetronome } from '@/lib/use-metronome'

/**
 * The Lyrics Sheet's "Pad" and "Click" bubbles, beside "Listen" and styled like
 * it, with the same icons as the song page and Edit song. One song sounds at a
 * time on the sheet: a song's Pad and Click play together, but starting either
 * on another song first stops everything the previous song was playing.
 * Leaving the page stops it too (the hooks stop on unmount, the engines when
 * the tab is hidden).
 */

/** The sheet entry (plan item id) whose bubbles last started a sound. */
let soundingSong: string | null = null

/** Before a bubble starts: silence another song's sounds, keep this song's. */
function claimSound(songId: string) {
  if (soundingSong !== songId) stopAllSounds()
  soundingSong = songId
}

function bubbleClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/20',
  )
}

/** A pad on the song's key for this plan; hidden when there's no key to play. */
export function PadBubble({ songId, songKey }: { songId: string; songKey: string | null }) {
  const tone = songKeyTone(songKey)
  const { padPlaying, togglePad } = useKeySound(tone)
  if (!tone || !keySoundSupported()) return null
  const action = padPlaying ? 'Stop the pad' : `Play a pad in ${songKey?.trim() ?? ''}`
  return (
    <button
      type="button"
      onClick={() => {
        if (!padPlaying) claimSound(songId)
        togglePad()
      }}
      aria-pressed={padPlaying}
      aria-label={action}
      title={action}
      className={bubbleClass(padPlaying)}
    >
      {padPlaying ? (
        <Pause className="size-3 fill-current" />
      ) : (
        <AudioWaveform className="size-3" />
      )}
      Pad
    </button>
  )
}

/** A metronome at this plan's tempo; hidden without a tempo it can play. */
export function ClickBubble({
  songId,
  bpm,
  meter,
}: {
  songId: string
  bpm: number | null
  meter: string | null
}) {
  const { playing, toggle } = useMetronome(bpm, meter)
  if (
    bpm === null ||
    bpm < METRONOME_MIN_BPM ||
    bpm > METRONOME_MAX_BPM ||
    !metronomeSupported()
  ) {
    return null
  }
  const meterLabel = parseMeter(meter) ? meter?.replace(/\s+/g, '') : null
  const action = playing
    ? 'Stop the click'
    : `Play a click: ${bpm} BPM${meterLabel ? ` in ${meterLabel}` : ''}`
  return (
    <button
      type="button"
      onClick={() => {
        if (!playing) claimSound(songId)
        toggle()
      }}
      aria-pressed={playing}
      aria-label={action}
      title={action}
      className={bubbleClass(playing)}
    >
      {playing ? <Pause className="size-3 fill-current" /> : <Metronome className="size-3" />}
      Click
    </button>
  )
}
