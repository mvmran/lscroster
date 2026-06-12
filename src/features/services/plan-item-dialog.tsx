import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_ITEM_LENGTH,
  formatLength,
  parseLengthInput,
  type PlanItem,
  type PlanItemKind,
  type Song,
} from '@/features/services/service-utils'
import {
  useCreatePlanItem,
  useUpdatePlanItem,
} from '@/features/services/use-plan-items'

export type PlanItemDialogState =
  | { mode: 'create'; kind: Exclude<PlanItemKind, 'song'> }
  | { mode: 'edit'; item: PlanItem }
  | null

function ItemForm({
  state,
  onClose,
  planId,
  itemCount,
  songs,
}: {
  state: NonNullable<PlanItemDialogState>
  onClose: () => void
  planId: string
  itemCount: number
  songs: Song[]
}) {
  const createItem = useCreatePlanItem(planId)
  const updateItem = useUpdatePlanItem(planId)

  const item = state.mode === 'edit' ? state.item : null
  const kind: PlanItemKind = item?.kind ?? (state.mode === 'create' ? state.kind : 'item')
  const song = item?.song_id ? songs.find((s) => s.id === item.song_id) : undefined

  const [title, setTitle] = useState(item?.title ?? '')
  const [length, setLength] = useState(
    formatLength(item?.length_seconds ?? DEFAULT_ITEM_LENGTH[kind]),
  )
  const [keyOverride, setKeyOverride] = useState(item?.key_override ?? '')
  const [description, setDescription] = useState(item?.description ?? '')

  const lengthSeconds = parseLengthInput(length)
  const lengthInvalid = lengthSeconds === null
  const pending = createItem.isPending || updateItem.isPending

  async function save() {
    const trimmed = title.trim()
    if (!trimmed || lengthSeconds === null) return
    const values = {
      title: trimmed,
      length_seconds: lengthSeconds,
      key_override: keyOverride.trim() || null,
      description: description.trim() || null,
    }
    try {
      if (item) {
        await updateItem.mutateAsync({ id: item.id, values })
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="pi-title">Title</Label>
          <Input
            id="pi-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'header' ? 'e.g. Worship' : 'e.g. Announcements'}
            autoFocus
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
            {kind === 'song' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="pi-key">Key</Label>
                <Input
                  id="pi-key"
                  value={keyOverride}
                  onChange={(e) => setKeyOverride(e.target.value)}
                  placeholder={song?.default_key ?? 'e.g. G'}
                />
                {song?.default_key && (
                  <p className="text-muted-foreground text-xs">
                    Leave blank for the default key ({song.default_key}).
                  </p>
                )}
              </div>
            )}
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

        {song && (
          <p className="text-muted-foreground text-xs">
            Linked to{' '}
            <Link to={`/songs/${song.id}`} className="text-foreground underline">
              {song.title}
            </Link>{' '}
            in the song library.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !title.trim() || lengthInvalid}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {item ? 'Save' : 'Add'}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Create a header/generic item, or edit any item (including songs).
 * Songs are created via the SongPickerDialog instead.
 */
export function PlanItemDialog({
  state,
  onClose,
  planId,
  itemCount,
  songs,
}: {
  state: PlanItemDialogState
  onClose: () => void
  planId: string
  /** Used to append new items at the end. */
  itemCount: number
  songs: Song[]
}) {
  const kind =
    state?.mode === 'edit' ? state.item.kind : (state?.kind ?? 'item')
  const heading =
    state?.mode === 'edit'
      ? kind === 'header'
        ? 'Edit header'
        : kind === 'song'
          ? 'Edit song'
          : 'Edit item'
      : kind === 'header'
        ? 'Add header'
        : 'Add item'

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {kind === 'header'
              ? 'Headers split the order of service into sections.'
              : 'Appears as a row in the order of service.'}
          </DialogDescription>
        </DialogHeader>
        {state && (
          <ItemForm
            // Remount per target so the fields seed from the right item.
            key={state.mode === 'edit' ? state.item.id : `new-${state.kind}`}
            state={state}
            onClose={onClose}
            planId={planId}
            itemCount={itemCount}
            songs={songs}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
