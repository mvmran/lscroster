import { useState } from 'react'
import { Pause, Play, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { songKeyTone } from '@/features/services/chord-notation'
import { PadButton } from '@/features/services/key-sound-buttons'
import {
  useClickLevel,
  usePadSettings,
  useSaveClickLevel,
} from '@/features/settings/use-pad-settings'
import { keySoundSupported } from '@/lib/key-sound'
import { metronomeSupported } from '@/lib/metronome'
import { padPresetFor } from '@/lib/pad-settings'
import { useKeySound } from '@/lib/use-key-sound'
import { useMetronome } from '@/lib/use-metronome'

/** What "Play both" plays: the pad in G under a steady 4/4. */
const PREVIEW_KEY = 'G'
const PREVIEW_BPM = 76

/**
 * Settings → Sounds, for everyone: which pad they have (and the way into the
 * full page where they choose or tune it), and how loud their click is, set by
 * ear against the pad with "Play both".
 */
export function SoundsCard() {
  const { settings, isPending } = usePadSettings()
  const { level: savedLevel, isPending: levelPending } = useClickLevel()
  const saveLevel = useSaveClickLevel()
  // The slider's position while it moves; the saved level otherwise.
  const [draft, setDraft] = useState<number | null>(null)
  const level = draft ?? savedLevel

  const pad = useKeySound(songKeyTone(PREVIEW_KEY), settings)
  const click = useMetronome(PREVIEW_BPM, '4/4', level)
  const playingBoth = pad.padPlaying || click.playing
  const canPlay = keySoundSupported() && metronomeSupported()

  function togglePlayBoth() {
    if (playingBoth) {
      if (pad.padPlaying) pad.togglePad()
      if (click.playing) click.toggle()
    } else {
      pad.togglePad()
      click.toggle()
    }
  }

  function commitLevel(value: number) {
    saveLevel.mutate(value, {
      onError: (error) => {
        toast.error(`Couldn't save the click volume: ${error.message}`)
        setDraft(null)
      },
    })
  }

  const name = padPresetFor(settings)?.name ?? 'Custom'
  const percent = `${Math.round(level * 100)}%`
  const bothAction = playingBoth
    ? 'Stop the pad and click'
    : `Play your pad in ${PREVIEW_KEY} with a click at ${PREVIEW_BPM} BPM`
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sounds</CardTitle>
        <CardDescription>
          The pad and click the song buttons and Lyrics Sheets play — just for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            <span className="text-muted-foreground">Pad: </span>
            <span className="font-medium">{isPending ? '…' : name}</span>
          </span>
          <PadButton songKey={PREVIEW_KEY} />
          <Button asChild variant="outline">
            <Link to="/settings/pad-sound">
              <SlidersHorizontal className="size-4" />
              Choose pad sound
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground shrink-0 text-sm">Click volume</span>
          <Slider
            className="max-w-64"
            min={0.05}
            max={1}
            step={0.05}
            value={[level]}
            disabled={levelPending}
            thumbLabel="Click volume"
            onValueChange={([value]) => setDraft(value)}
            onValueCommit={([value]) => commitLevel(value)}
          />
          <span className="w-10 shrink-0 text-sm tabular-nums">{percent}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={playingBoth ? 'default' : 'outline'}
            onClick={togglePlayBoth}
            disabled={!canPlay}
            aria-pressed={playingBoth}
            title={canPlay ? bothAction : 'This browser can’t play sounds'}
          >
            {playingBoth ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4" />
            )}
            {playingBoth ? 'Stop' : 'Play both'}
          </Button>
          <span className="text-muted-foreground text-sm">
            Your pad with a click, to set the balance by ear.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
