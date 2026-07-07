import { useMemo, useState } from 'react'
import { ArrowLeft, Link2, Loader2, Music, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  arrangementDisplayTitle,
  buildArrangementIndex,
  DEFAULT_ITEM_LENGTH,
  formatPlanDateShort,
  isMedley,
  type Song,
  type SongArrangement,
} from '@/features/services/service-utils'
import { useCreatePlanItem } from '@/features/services/use-plan-items'
import {
  fetchDefaultArrangement,
  useCreateSong,
  useSongUsage,
} from '@/features/services/use-songs'

/**
 * Pick a song from the library to add to the order of service. Shows when each
 * song was last scheduled so leaders avoid repeating songs week to week.
 * Since #130 a plan item references an arrangement: songs with only their
 * Default are added in one click, songs with more arrangements (including
 * medleys) get a second step to choose which one (issue #130).
 */
export function SongPickerDialog({
  open,
  onOpenChange,
  planId,
  itemCount,
  songs,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  itemCount: number
  songs: Song[]
}) {
  const createItem = useCreatePlanItem(planId)
  const createSong = useCreateSong()
  const { data: usage } = useSongUsage()
  const [search, setSearch] = useState('')
  const [arrangementStep, setArrangementStep] = useState<Song | null>(null)

  const arrangementIndex = useMemo(() => buildArrangementIndex(songs), [songs])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return songs
      .filter((s) => s.status === 'active')
      .filter(
        (s) =>
          term === '' ||
          `${s.title} ${s.author ?? ''} ${s.ccli_number ?? ''}`.toLowerCase().includes(term),
      )
  }, [songs, search])

  const pending = createItem.isPending || createSong.isPending

  function close() {
    onOpenChange(false)
    setSearch('')
    setArrangementStep(null)
  }

  async function addArrangement(arrangement: SongArrangement, fallbackTitle: string) {
    const info = arrangementIndex.get(arrangement.id)
    try {
      await createItem.mutateAsync({
        kind: 'song',
        title: info ? arrangementDisplayTitle(info) : fallbackTitle,
        arrangement_id: arrangement.id,
        length_seconds: DEFAULT_ITEM_LENGTH.song,
        sort_order: itemCount,
      })
      close()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add song')
    }
  }

  async function pickSong(song: Song) {
    if (song.arrangements.length > 1) {
      setArrangementStep(song)
      return
    }
    const arrangement = song.arrangements[0]
    if (!arrangement) {
      toast.error('This song has no arrangement yet')
      return
    }
    await addArrangement(arrangement, song.title)
  }

  async function createAndAdd() {
    const title = search.trim()
    if (!title) return
    try {
      const song = await createSong.mutateAsync({ title })
      // The Default arrangement is created by a DB trigger — fetch it to link
      // the plan item (#130).
      const arrangement = await fetchDefaultArrangement(song.id)
      if (!arrangement) throw new Error('Could not find the new default arrangement')
      await createItem.mutateAsync({
        kind: 'song',
        title: song.title,
        arrangement_id: arrangement.id,
        length_seconds: DEFAULT_ITEM_LENGTH.song,
        sort_order: itemCount,
      })
      close()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create song')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-lg">
        {arrangementStep ? (
          <>
            <DialogHeader>
              <DialogTitle>Choose an arrangement</DialogTitle>
              <DialogDescription>
                “{arrangementStep.title}” has more than one arrangement.
              </DialogDescription>
            </DialogHeader>
            <div className="-mx-2 flex-1 overflow-y-auto px-2">
              <ul className="flex flex-col">
                {arrangementStep.arrangements.map((arrangement) => {
                  const info = arrangementIndex.get(arrangement.id)
                  const medley = info ? isMedley(info) : false
                  return (
                    <li key={arrangement.id}>
                      <button
                        type="button"
                        onClick={() => addArrangement(arrangement, arrangementStep.title)}
                        disabled={pending}
                        className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-medium">
                            {arrangement.name}
                            {medley && <Link2 className="size-3.5 opacity-60" />}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {medley && info
                              ? info.songs.map((s) => s.title).join(' / ')
                              : arrangement.is_default
                                ? 'Default arrangement'
                                : arrangementStep.title}
                          </p>
                        </div>
                        {arrangement.song_key && (
                          <Badge variant="secondary" className="shrink-0">
                            {arrangement.song_key}
                          </Badge>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <Button
              variant="outline"
              onClick={() => setArrangementStep(null)}
              disabled={pending}
            >
              <ArrowLeft className="size-4" />
              Back to songs
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a song</DialogTitle>
              <DialogDescription>
                Search the library by title, author or CCLI number.
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search songs…"
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="-mx-2 flex-1 overflow-y-auto px-2">
              {filtered.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
                  <Music className="size-6" />
                  {songs.length === 0 ? 'The song library is empty.' : 'No songs match.'}
                </div>
              ) : (
                <ul className="flex flex-col">
                  {filtered.map((song) => {
                    const lastUsed = usage?.[song.id]?.last_used ?? null
                    const nextScheduled = usage?.[song.id]?.next_scheduled ?? null
                    const arrangementCount = song.arrangements.length
                    return (
                      <li key={song.id}>
                        <button
                          type="button"
                          onClick={() => pickSong(song)}
                          disabled={pending}
                          className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left disabled:opacity-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{song.title}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {[
                                song.author,
                                lastUsed ? `last: ${formatPlanDateShort(lastUsed)}` : null,
                                arrangementCount > 1
                                  ? `${arrangementCount} arrangements`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                          {nextScheduled && (
                            <Badge variant="outline" className="shrink-0">
                              {formatPlanDateShort(nextScheduled)}
                            </Badge>
                          )}
                          {song.default_key && (
                            <Badge variant="secondary" className="shrink-0">
                              {song.default_key}
                            </Badge>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {search.trim() && (
              <Button variant="outline" onClick={createAndAdd} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Create “{search.trim()}” and add it
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
