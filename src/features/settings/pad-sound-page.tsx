import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AudioWaveform, Loader2, Pause, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { usePadSettings, useSavePadSettings } from '@/features/settings/use-pad-settings'
import {
  keySoundSupported,
  padOwner,
  startPad,
  stopPad,
  subscribeKeySound,
  updatePad,
} from '@/lib/key-sound'
import {
  DEFAULT_PAD,
  PAD_LIVE_SETTINGS,
  PAD_PRESETS,
  PAD_VOICINGS,
  PAD_WAVES,
  padPresetFor,
  type PadSettings,
  type PadVoicing,
} from '@/lib/pad-settings'
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes-warning'
import { cn } from '@/lib/utils'

const KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

type NumberSetting = Exclude<keyof PadSettings, 'wave' | 'voicing'>

/** The sliders, in the order a person tunes: tone first, then space, then shape. */
const SLIDERS: { key: NumberSetting; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'cutoff', label: 'Brightness (filter)', min: 200, max: 5000, step: 10, unit: 'Hz' },
  { key: 'q', label: 'Filter resonance', min: 0.1, max: 8, step: 0.1 },
  { key: 'drift', label: 'Filter drift', min: 0, max: 1000, step: 10, unit: 'Hz' },
  { key: 'rate', label: 'Drift speed', min: 0.01, max: 0.5, step: 0.01, unit: 'Hz' },
  { key: 'reverb', label: 'Reverb', min: 0, max: 1, step: 0.01 },
  { key: 'room', label: 'Room size', min: 1, max: 8, step: 0.5, unit: 's' },
  { key: 'detune', label: 'Detune spread', min: 0, max: 30, step: 1, unit: 'cents' },
  { key: 'voices', label: 'Voices per note', min: 1, max: 4, step: 1 },
  { key: 'spread', label: 'Stereo width', min: 0, max: 1, step: 0.05 },
  { key: 'sparkle', label: 'Octave-up sparkle', min: 0, max: 1, step: 0.05 },
  { key: 'attack', label: 'Fade in', min: 0.1, max: 6, step: 0.1, unit: 's' },
  { key: 'release', label: 'Fade out', min: 0.2, max: 6, step: 0.1, unit: 's' },
  { key: 'octave', label: 'Octave', min: -1, max: 1, step: 1 },
  { key: 'level', label: 'Level', min: 0, max: 1, step: 0.01 },
]

const isLive = (key: keyof PadSettings) =>
  (PAD_LIVE_SETTINGS as readonly string[]).includes(key)

const sameSettings = (a: PadSettings, b: PadSettings) =>
  (Object.keys(a) as (keyof PadSettings)[]).every((k) => a[k] === b[k])

/**
 * Settings → Pad sound: choose the pad the waveform buttons play — one of the
 * presets, or tuned with the controls below — hearing it as you go, and save
 * it to your account. The preview plays the pad on its own, in a key of your
 * choice, and follows every change: filter, drift, reverb and level move while
 * it plays; anything else restarts it with a crossfade.
 */
export function PadSoundPage() {
  const { settings: saved, isPending } = usePadSettings()
  const save = useSavePadSettings()
  // Null until something is changed: the page shows what is saved.
  const [draft, setDraft] = useState<PadSettings | null>(null)
  const current = draft ?? saved
  const dirty = draft !== null && !sameSettings(draft, saved)
  useUnsavedChangesWarning(dirty)

  const [tonic, setTonic] = useState(7) // G
  const [minor, setMinor] = useState(false)
  const [id] = useState(() => Symbol('pad-preview'))
  const playing = useSyncExternalStore(subscribeKeySound, padOwner) === id
  // What the preview is playing now, to tell a live change from a restart.
  const playingWith = useRef<PadSettings>(current)

  function play(settings: PadSettings, key = { tonic, minor }) {
    startPad(id, key, settings)
    playingWith.current = settings
  }

  /** Take new settings; a playing preview follows them. */
  function change(next: PadSettings) {
    setDraft(next)
    if (!playing) return
    const before = playingWith.current
    const restart = (Object.keys(next) as (keyof PadSettings)[]).some(
      (k) => next[k] !== before[k] && !isLive(k),
    )
    if (restart) play(next)
    else {
      updatePad(id, next)
      playingWith.current = next
    }
  }

  function changeKey(next: { tonic: number; minor: boolean }) {
    setTonic(next.tonic)
    setMinor(next.minor)
    if (playing) play(current, next)
  }

  useEffect(() => () => stopPad(id), [id])

  const preset = padPresetFor(current)
  const supported = keySoundSupported()

  function onSave() {
    save.mutate(current, {
      onSuccess: () => {
        setDraft(null)
        toast.success(`Pad sound saved: ${preset?.name ?? 'Custom'}`)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pad sound"
        backTo="/settings"
        backLabel="Settings"
        description="The pad you hear from the waveform buttons — on songs, in a plan's Edit song and on Lyrics Sheets. Yours alone, on every device you sign in on."
      />

      {/* Preview, and the choice so far. Sticky so it stays in reach while tuning. */}
      <Card className="bg-background/95 sticky top-14 z-10 py-3 backdrop-blur">
        <CardContent className="flex flex-wrap items-center gap-3 px-4">
          <Button
            type="button"
            onClick={() => (playing ? stopPad(id) : play(current))}
            disabled={!supported}
            aria-pressed={playing}
            title={supported ? (playing ? 'Stop the preview' : 'Hear this pad') : 'This browser can’t play sound'}
            className="min-w-24"
          >
            {playing ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <AudioWaveform className="size-4" />
            )}
            {playing ? 'Stop' : 'Preview'}
          </Button>
          <div className="flex items-center gap-2">
            <Label htmlFor="pad-key" className="sr-only">
              Preview key
            </Label>
            <Select
              value={String(tonic)}
              onValueChange={(v) => changeKey({ tonic: Number(v), minor })}
            >
              <SelectTrigger id="pad-key" className="w-20" title="The key the preview plays in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEYS.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={minor ? 'minor' : 'major'}
              onValueChange={(v) => changeKey({ tonic, minor: v === 'minor' })}
            >
              <SelectTrigger className="w-24" aria-label="Major or minor" title="Major or minor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="major">major</SelectItem>
                <SelectItem value="minor">minor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {isPending ? '…' : (preset?.name ?? 'Custom')}
              {dirty && ' · not saved'}
            </span>
            <Button
              type="button"
              onClick={onSave}
              disabled={!dirty || save.isPending}
              title={dirty ? 'Save this pad sound to your account' : 'Nothing changed yet'}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Presets</CardTitle>
          <CardDescription>
            Start from one of these. Choosing one plays it; tune it below if you like.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PAD_PRESETS.map((p) => {
            const chosen = preset?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setDraft(p.settings)
                  if (supported) play(p.settings)
                }}
                aria-pressed={chosen}
                title={`Choose ${p.name} and hear it`}
                className={cn(
                  'hover:bg-accent/50 flex min-h-16 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left',
                  chosen && 'border-primary ring-primary ring-1',
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  {p.name}
                  {p.settings === DEFAULT_PAD && (
                    <Badge variant="secondary" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{p.note}</span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fine-tune</CardTitle>
          <CardDescription>
            Brightness, drift, reverb and level change as it plays; the rest
            restart the pad with a crossfade.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pad-wave">Waveform</Label>
              <Select
                value={current.wave}
                onValueChange={(v) => change({ ...current, wave: v as PadSettings['wave'] })}
              >
                <SelectTrigger id="pad-wave" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAD_WAVES.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pad-voicing">Voicing</Label>
              <Select
                value={current.voicing}
                onValueChange={(v) => change({ ...current, voicing: v as PadVoicing })}
              >
                <SelectTrigger id="pad-voicing" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAD_VOICINGS) as PadVoicing[]).map((v) => (
                    <SelectItem key={v} value={v}>
                      {PAD_VOICINGS[v].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {SLIDERS.map((s) => (
              <div key={s.key} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>{s.label}</Label>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {current[s.key]}
                    {s.unit ? ` ${s.unit}` : ''}
                  </span>
                </div>
                <Slider
                  thumbLabel={s.label}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={[current[s.key]]}
                  // Live settings follow the thumb; the rest restart the pad once,
                  // when it is let go, rather than on every step of a drag.
                  onValueChange={([v]) =>
                    isLive(s.key) ? change({ ...current, [s.key]: v }) : setDraft({ ...current, [s.key]: v })
                  }
                  onValueCommit={([v]) => {
                    if (!isLive(s.key)) change({ ...current, [s.key]: v })
                  }}
                />
              </div>
            ))}
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => change(DEFAULT_PAD)}
              disabled={sameSettings(current, DEFAULT_PAD)}
              title="Go back to Dark Warm, the default (then Save)"
            >
              <RotateCcw className="size-4" />
              Reset to Dark Warm
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
