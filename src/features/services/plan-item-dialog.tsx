import { useMemo, useState } from 'react'
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
import {
  sameSequence,
  sequenceChoices,
  songSequenceOf,
} from '@/features/services/lyric-sections'
import { PlanSequenceEditor } from '@/features/services/plan-sequence-editor'
import { PlayRecordingButton } from '@/features/services/play-recording-button'
import {
  arrangementPath,
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
  usePlanItemLyrics,
  useUpdatePlanItem,
} from '@/features/services/use-plan-items'
import {
  useEstimateSongLength,
  useSongLengthAvailable,
} from '@/features/services/use-song-length'
import { cn } from '@/lib/utils'
import { keepOpenWhileDragging } from '@/lib/reorder'

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

/**
 * An arrangement as the song dialog names it: its own name, the songs it
 * strings together when it's a medley, then its key — "Acoustic · D",
 * "Easter (medley: Song A / Song B) · G".
 */
function arrangementChoiceLabel(
  arrangement: SongArrangement,
  info: ArrangementInfo | undefined,
): string {
  const medley = info && isMedley(info) ? ` (medley: ${arrangementSongTitle(info)})` : ''
  const key = arrangement.song_key ? ` · ${arrangement.song_key}` : ''
  return `${arrangement.name}${medley}${key}`
}

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
  // Derived until someone picks: editing before the song library has loaded
  // leaves `arrangement` unknown for a moment, and a choice frozen then would
  // be null and save over the item's recording. While it's still unknown,
  // the item keeps what it has.
  const [pickedRecording, setRecording] = useState<string | null | undefined>(undefined)
  const recording =
    pickedRecording !== undefined
      ? pickedRecording
      : arrangement
        ? chosenReferenceUrl(item?.reference_url, arrangement.reference_urls)
        : (item?.reference_url ?? null)
  // The song's sequence for this plan (0060). Null follows the song's own —
  // its pinned lyrics version once published, else the latest — which is
  // where a song added afresh starts; the item keeps an order only once it is
  // rearranged. Picking another arrangement starts again from that one's.
  const songLyrics = usePlanItemLyrics(
    kind === 'song' ? linkedId : null,
    item?.lyrics_id ?? null,
  )
  const songSequence = useMemo(() => songSequenceOf(songLyrics.data ?? null), [songLyrics.data])
  const choices = useMemo(
    () => sequenceChoices(songLyrics.data?.lyrics ?? '', songSequence),
    [songLyrics.data, songSequence],
  )
  const [ownSequence, setOwnSequence] = useState<string[] | null>(item?.sequence ?? null)
  const sequence = ownSequence ?? songSequence

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
      ...(kind === 'song'
        ? {
            reference_url: recording,
            // Stored only when it differs from the song's, so an item nobody
            // rearranged follows later edits to the song.
            sequence:
              ownSequence && !sameSequence(ownSequence, songSequence) ? ownSequence : null,
          }
        : {}),
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
      {/* min-w-0: a grid item won't shrink below its widest unbreakable
          content, and a long recording link would push the whole form past
          a phone's edge; this lets the link truncate instead. */}
      <div className="flex min-w-0 flex-col gap-3">
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
                setOwnSequence(null)
              }}
            >
              <SelectTrigger id="pi-arrangement" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {picked.arrangements.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {arrangementChoiceLabel(a, arrangements.get(a.id))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Editing shows the arrangement but can't change it: on a published
            plan the item's lyrics are pinned to this arrangement's, so a bare
            switch would show the old words (an open question in PHASES.md). */}
        {item && info && (
          <div
            role="group"
            aria-labelledby="pi-arrangement-label"
            className="flex flex-col gap-2"
          >
            <Label id="pi-arrangement-label" className="text-muted-foreground">
              Arrangement
            </Label>
            {/* Drawn like the read-only Meter box, but text, not an input:
                a medley's label runs long and has to wrap on a phone. */}
            <p
              id="pi-arrangement"
              className="border-input text-muted-foreground bg-muted/40 dark:bg-muted/30 shadow-well min-h-8 rounded-lg border px-2.5 py-1 text-base break-words md:text-sm"
            >
              {arrangementChoiceLabel(info.arrangement, info)}
            </p>
            {/* Said on screen, not in a tooltip: a phone never shows one. */}
            <p className="text-muted-foreground text-xs">
              To use another arrangement, remove this song and add it again.
            </p>
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

        {/* Length, then the length estimate and the pad / key riff /
            metronome buttons, on one row; on a phone the buttons wrap below. */}
        {kind !== 'header' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <Label htmlFor="pi-length" className="shrink-0">
                Length (m:ss)
              </Label>
              <Input
                id="pi-length"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                inputMode="numeric"
                placeholder="5:00"
                className="w-24"
              />
              {kind === 'song' && (
                <div className="ml-auto flex items-center gap-2">
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
              )}
            </div>
            {lengthInvalid && (
              <p className="text-destructive text-sm">Use minutes or m:ss, e.g. 4:30</p>
            )}
          </div>
        )}

        {/* Key, BPM and Meter on one row, each label beside its box, and one
            line under them saying what blank means. */}
        {kind === 'song' && (
          <div className="flex flex-col gap-1.5">
            {/* Three across from sm up; a phone is too narrow for three
                boxes, so Meter takes the next row there. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="pi-key" className="shrink-0">
                  Key
                </Label>
                <Input
                  id="pi-key"
                  value={keyOverride}
                  onChange={(e) => setKeyOverride(e.target.value)}
                  placeholder={arrangementKey ?? 'e.g. G'}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="pi-bpm" className="shrink-0">
                  BPM
                </Label>
                <Input
                  id="pi-bpm"
                  value={bpmOverride}
                  onChange={(e) => setBpmOverride(e.target.value)}
                  inputMode="numeric"
                  placeholder={arrangementBpm?.toString() ?? 'e.g. 72'}
                  aria-invalid={bpmInvalid}
                />
              </div>
              {/* The meter is the arrangement's: shown for reference (the
                  metronome counts in it), changed on the song's page. */}
              <div className="flex items-center gap-2">
                <Label htmlFor="pi-meter" className="text-muted-foreground shrink-0">
                  Meter
                </Label>
                <Input
                  id="pi-meter"
                  value={soundMeter ?? ''}
                  readOnly
                  tabIndex={-1}
                  placeholder="Not set"
                  title="The arrangement’s meter — change it on the song’s page"
                  className={cn(
                    'text-muted-foreground bg-muted/40 dark:bg-muted/30 cursor-default',
                    // Read-only: a click selects nothing worth a focus ring.
                    'focus-visible:border-input focus-visible:ring-0',
                  )}
                />
              </div>
            </div>
            {bpmInvalid ? (
              <p className="text-destructive text-sm">BPM is a whole number above 0</p>
            ) : (
              (arrangementKey || arrangementBpm !== null || soundMeter === null) && (
                <p className="text-muted-foreground text-xs">
                  {(arrangementKey || arrangementBpm !== null) && (
                    <>
                      Leave blank for the arrangement’s{' '}
                      {[
                        arrangementKey && `key (${arrangementKey})`,
                        arrangementBpm !== null && `tempo (${arrangementBpm})`,
                      ]
                        .filter(Boolean)
                        .join(' and ')}
                      .{' '}
                    </>
                  )}
                  {soundMeter === null &&
                    'The song has no meter yet — set one on its page for the metronome.'}
                </p>
              )
            )}
          </div>
        )}

        {/* After Key and BPM: hidden for a song with no sections to order. */}
        {kind === 'song' && (choices.length > 0 || sequence.length > 0) && (
          <PlanSequenceEditor
            value={sequence}
            choices={choices}
            custom={ownSequence !== null && !sameSequence(ownSequence, songSequence)}
            onChange={setOwnSequence}
            onReset={() => setOwnSequence(null)}
          />
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
            {/* One link to the arrangement itself — a medley's lyrics, key and
                files live on it, not on any one of its songs. */}
            <Link to={arrangementPath(info)} className="text-primary underline">
              {arrangementSongTitle(info)}
              {!info.arrangement.is_default && ` (${info.arrangement.name})`}
            </Link>{' '}
            in the song library.
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
      {/* A song's box carries the sequence chips, which wrap onto more rows
          the longer the song: wider so they wrap less, and never taller than
          the screen — past that it scrolls inside, footer and all. */}
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
        onEscapeKeyDown={keepOpenWhileDragging}
      >
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
