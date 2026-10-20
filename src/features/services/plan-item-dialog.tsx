import { useState } from 'react'
import { Loader2, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SongSoundButtons } from '@/features/services/key-sound-buttons'
import { PlayRecordingButton } from '@/features/services/play-recording-button'
import {
  arrangementSongTitle,
  chosenReferenceUrl,
  DEFAULT_ITEM_LENGTH,
  formatLength,
  isMedley,
  parseLengthInput,
  playableUrls,
  recordingLabel,
  type ArrangementInfo,
  type PlanItem,
  type PlanItemKind,
  type SongArrangement,
} from '@/features/services/service-utils'
import {
  useCreatePlanItem,
  useUpdatePlanItem,
} from '@/features/services/use-plan-items'
import {
  useEstimateSongLength,
  useSongLengthAvailable,
} from '@/features/services/use-song-length'

/** A song picked in the SongPickerDialog, on its way onto the plan. */
export interface PickedSong {
  title: string
  /** Its arrangements, Default first; more than one shows a dropdown. */
  arrangements: SongArrangement[]
}

export type PlanItemDialogState =
  | { mode: 'create'; kind: Exclude<PlanItemKind, 'song'> }
  | { mode: 'add-song'; song: PickedSong }
  | { mode: 'edit'; item: PlanItem }
  | null

function ItemForm({
  state,
  onClose,
  planId,
  itemCount,
  arrangements,
}: {
  state: NonNullable<PlanItemDialogState>
  onClose: () => void
  planId: string
  itemCount: number
  arrangements: Map<string, ArrangementInfo>
}) {
  const createItem = useCreatePlanItem(planId)
  const updateItem = useUpdatePlanItem(planId)

  const item = state.mode === 'edit' ? state.item : null
  const picked = state.mode === 'add-song' ? state.song : null
  const kind: PlanItemKind =
    item?.kind ?? (state.mode === 'create' ? state.kind : 'song')

  // Adding a song: which of its arrangements goes on the plan.
  const [arrangementId, setArrangementId] = useState(
    () => (picked?.arrangements.find((a) => a.is_default) ?? picked?.arrangements[0])?.id ?? null,
  )
  const chosen = picked?.arrangements.find((a) => a.id === arrangementId) ?? null
  const linkedId = item?.arrangement_id ?? arrangementId
  const info = linkedId ? arrangements.get(linkedId) : undefined
  // A song created a moment ago may not be in the library index yet.
  const arrangement = info?.arrangement ?? chosen
  const arrangementKey = arrangement?.song_key ?? null
  const arrangementBpm = arrangement?.bpm ?? null
  const titleFor = (id: string | null) => {
    const found = id ? arrangements.get(id) : undefined
    return found ? arrangementSongTitle(found) : (picked?.title ?? '')
  }

  const [title, setTitle] = useState(item?.title ?? (picked ? titleFor(arrangementId) : ''))
  // While adding, the title follows the arrangement (a medley names every song)
  // until someone types one.
  const [titleEdited, setTitleEdited] = useState(false)
  const [length, setLength] = useState(
    formatLength(item?.length_seconds ?? DEFAULT_ITEM_LENGTH[kind]),
  )
  const [keyOverride, setKeyOverride] = useState(item?.key_override ?? '')
  const [bpmOverride, setBpmOverride] = useState(item?.bpm_override?.toString() ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  // Which of the arrangement's recordings this plan follows (0053): the item's
  // pick, else the first. Picking another arrangement starts again from its first.
  const recordings = playableUrls(arrangement?.reference_urls)
  const [recording, setRecording] = useState(() =>
    chosenReferenceUrl(item?.reference_url, arrangement?.reference_urls),
  )

  const lengthSeconds = parseLengthInput(length)
  const lengthInvalid = lengthSeconds === null
  // Blank means "whatever the arrangement says", which is the common case and
  // must stay valid; anything typed has to be a whole tempo, as the column says.
  const bpmValue = bpmOverride.trim() === '' ? null : Number(bpmOverride)
  const bpmInvalid =
    bpmValue !== null && (!Number.isInteger(bpmValue) || bpmValue <= 0)
  const pending = createItem.isPending || updateItem.isPending
  // What the sound buttons play while adding or editing a song: this plan's
  // key and tempo as typed (saved or not), else the arrangement's; its meter.
  const soundKey = keyOverride.trim() || arrangementKey
  const soundBpm = bpmInvalid ? null : (bpmValue ?? arrangementBpm)
  const soundMeter = arrangement?.meter ?? null
  // The AI length estimate (optional per church): from the song's lyrics and
  // chords at this plan's tempo, plus the changeover. It only fills the Length
  // box — nothing is saved until Save or Add.
  const { data: canEstimate } = useSongLengthAvailable(kind === 'song')
  const estimate = useEstimateSongLength()
  const estimateBlocked = !linkedId
    ? 'Choose an arrangement first'
    : soundBpm === null
      ? 'Give the song a BPM first — the length comes from it'
      : null

  function estimateLength() {
    if (!linkedId || estimateBlocked) return
    estimate.mutate(
      { arrangementId: linkedId, lyricsId: item?.lyrics_id ?? null, bpm: soundBpm },
      {
        onSuccess: (result) => {
          setLength(formatLength(result.totalSeconds))
          // Under 1½ minutes is usually lyrics written out only in part — the
          // estimate can only count what's there, so say so.
          const short =
            result.songSeconds < 90
              ? `Only ${result.bars} bars are written out — if the lyrics are ` +
                'incomplete, so is this estimate. '
              : ''
          toast.success(
            `About ${formatLength(result.songSeconds)} to play (${result.bars} bars), ` +
              `plus ${result.changeSeconds} s to change songs`,
            {
              description: `${short}${result.reasoning}`.trim() || undefined,
              // Twice the usual 4 s: there's a working to read, not just "done".
              duration: 8000,
            },
          )
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  async function save() {
    const trimmed = title.trim()
    if (!trimmed || lengthSeconds === null || bpmInvalid) return
    if (picked && !arrangementId) return
    const values = {
      title: trimmed,
      length_seconds: lengthSeconds,
      key_override: keyOverride.trim() || null,
      bpm_override: bpmValue,
      description: description.trim() || null,
      ...(kind === 'song' ? { reference_url: recording } : {}),
    }
    try {
      if (item) {
        await updateItem.mutateAsync({ id: item.id, values })
      } else if (picked) {
        await createItem.mutateAsync({
          ...values,
          kind: 'song',
          arrangement_id: arrangementId,
          sort_order: itemCount,
        })
      } else {
        await createItem.mutateAsync({ ...values, kind, sort_order: itemCount })
      }
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save item')
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {picked && picked.arrangements.length > 1 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pi-arrangement">Arrangement</Label>
            <Select
              value={arrangementId ?? undefined}
              onValueChange={(id) => {
                setArrangementId(id)
                if (!titleEdited) setTitle(titleFor(id))
                const next =
                  arrangements.get(id)?.arrangement ??
                  picked.arrangements.find((a) => a.id === id)
                setRecording(chosenReferenceUrl(null, next?.reference_urls))
              }}
            >
              <SelectTrigger id="pi-arrangement" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {picked.arrangements.map((a) => {
                  const found = arrangements.get(a.id)
                  const medley = found && isMedley(found)
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {medley ? arrangementSongTitle(found) : a.name}
                      {a.song_key ? ` · ${a.song_key}` : ''}
                      {medley ? ' (medley)' : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="pi-title">Title</Label>
          <Input
            id="pi-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleEdited(true)
            }}
            placeholder={kind === 'header' ? 'e.g. Worship' : 'e.g. Announcements'}
            // Not when adding a song: the title is filled in already, and on a
            // phone the keyboard would cover the dialog for nothing.
            autoFocus={!picked}
          />
        </div>

        {kind !== 'header' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pi-length">Length (min or m:ss)</Label>
              <Input
                id="pi-length"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                inputMode="numeric"
                placeholder="5:00"
              />
              {lengthInvalid && (
                <p className="text-destructive text-sm">Use minutes or m:ss, e.g. 4:30</p>
              )}
            </div>
            {/* Beside Length: the length estimate and the pad / key riff /
                metronome trio, adding a song as well as editing one. The label
                is invisible, there only to keep the buttons level with the
                Length box. */}
            {kind === 'song' && (
              <div className="flex flex-col gap-2">
                <Label aria-hidden className="invisible">
                  Sounds
                </Label>
                <div className="flex items-center gap-2">
                  {canEstimate && (
                    <span
                      className="inline-flex shrink-0"
                      title={estimateBlocked ?? undefined}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={estimateLength}
                        disabled={!!estimateBlocked || estimate.isPending}
                        aria-label="Estimate the length with AI"
                        title={
                          estimateBlocked
                            ? undefined
                            : 'Estimate the length with AI — from the lyrics, chords ' +
                              'and BPM, plus time to change songs'
                        }
                      >
                        {estimate.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Timer className="size-4" />
                        )}
                      </Button>
                    </span>
                  )}
                  <SongSoundButtons
                    songKey={soundKey}
                    bpm={soundBpm}
                    meter={soundMeter}
                  />
                </div>
              </div>
            )}
            {kind === 'song' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="pi-key">Key</Label>
                <Input
                  id="pi-key"
                  value={keyOverride}
                  onChange={(e) => setKeyOverride(e.target.value)}
                  placeholder={arrangementKey ?? 'e.g. G'}
                />
                {arrangementKey && (
                  <p className="text-muted-foreground text-xs">
                    Leave blank for the arrangement’s key ({arrangementKey}).
                  </p>
                )}
              </div>
            )}
            {/* Key and BPM side by side, under Length and the buttons. */}
            {kind === 'song' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="pi-bpm">BPM</Label>
                <Input
                  id="pi-bpm"
                  value={bpmOverride}
                  onChange={(e) => setBpmOverride(e.target.value)}
                  inputMode="numeric"
                  placeholder={arrangementBpm?.toString() ?? 'e.g. 72'}
                  aria-invalid={bpmInvalid}
                />
                {bpmInvalid ? (
                  <p className="text-destructive text-sm">Whole number above 0</p>
                ) : (
                  arrangementBpm !== null && (
                    <p className="text-muted-foreground text-xs">
                      Leave blank for the arrangement’s tempo ({arrangementBpm}).
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {kind === 'song' && recordings.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pi-recording">Reference recording</Label>
            <div className="flex items-center gap-2">
              <Select value={recording ?? undefined} onValueChange={setRecording}>
                <SelectTrigger id="pi-recording" className="w-full min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recordings.map((url, i) => (
                    <SelectItem key={`${i}-${url}`} value={url}>
                      {i + 1} · {recordingLabel(url)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recording && <PlayRecordingButton url={recording} />}
            </div>
            <p className="text-muted-foreground text-xs">
              The Lyrics Sheet’s Listen link and the set-list email point here.
            </p>
          </div>
        )}

        {kind !== 'header' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pi-description">Description (optional)</Label>
            <Textarea
              id="pi-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes for the run sheet, e.g. who's speaking"
            />
          </div>
        )}

        {info && (
          <p className="text-muted-foreground text-xs">
            Linked to{' '}
            {info.songs.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ' / '}
                <Link to={`/songs/${s.id}`} className="text-foreground underline">
                  {s.title}
                </Link>
              </span>
            ))}
            {!info.arrangement.is_default && ` (${info.arrangement.name})`} in the
            song library.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={pending || !title.trim() || lengthInvalid || bpmInvalid}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {item ? 'Save' : 'Add'}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Create a header/generic item, add a song picked in the SongPickerDialog (with
 * its arrangement, key, tempo and notes for this plan), or edit any item.
 */
export function PlanItemDialog({
  state,
  onClose,
  planId,
  itemCount,
  arrangements,
}: {
  state: PlanItemDialogState
  onClose: () => void
  planId: string
  /** Used to append new items at the end. */
  itemCount: number
  arrangements: Map<string, ArrangementInfo>
}) {
  const kind =
    state?.mode === 'edit'
      ? state.item.kind
      : state?.mode === 'add-song'
        ? 'song'
        : (state?.kind ?? 'item')
  const heading =
    state?.mode === 'edit'
      ? kind === 'header'
        ? 'Edit header'
        : kind === 'song'
          ? 'Edit song'
          : 'Edit item'
      : kind === 'song'
        ? 'Add song'
        : kind === 'header'
          ? 'Add header'
          : 'Add item'

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {state?.mode === 'add-song'
              ? `Set the key, tempo and notes for this plan, then add “${state.song.title}”.`
              : kind === 'header'
                ? 'Headers split the order of service into sections.'
                : 'Appears as a row in the order of service.'}
          </DialogDescription>
        </DialogHeader>
        {state && (
          <ItemForm
            // Remount per target so the fields seed from the right item.
            key={
              state.mode === 'edit'
                ? state.item.id
                : state.mode === 'add-song'
                  ? `song-${state.song.arrangements[0]?.id}`
                  : `new-${state.kind}`
            }
            state={state}
            onClose={onClose}
            planId={planId}
            itemCount={itemCount}
            arrangements={arrangements}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
