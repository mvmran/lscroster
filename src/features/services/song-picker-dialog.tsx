import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Link2,
  Loader2,
  Music,
  Plus,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
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
import {
  MAX_SIMILAR_SHOWN,
  findSimilarSongs,
} from '@/features/services/song-duplicates'
import { useCreatePlanItem } from '@/features/services/use-plan-items'
import {
  fetchDefaultArrangement,
  useCreateSong,
  useSongUsage,
} from '@/features/services/use-songs'
import {
  loadRejectedSongs,
  saveRejectedSongs,
  useSongSuggestAvailable,
  useSuggestSong,
  type SongSuggestion,
} from '@/features/services/use-song-suggest'

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

  // AI suggestion (optional per instance). The probe only fires while the
  // dialog is open; rejected songs persist per plan so a re-press skips them.
  const suggestAvailable = useSongSuggestAvailable(open)
  const suggest = useSuggestSong()
  const [suggestion, setSuggestion] = useState<SongSuggestion | null>(null)
  // Seeded from storage on mount; the plan page keys this dialog by plan id, so
  // a different plan remounts it and starts the rejects (and picks) fresh.
  const [rejected, setRejected] = useState<string[]>(() => loadRejectedSongs(planId))

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

  // The search above matches on the literal characters, which is exactly what
  // fails a second romanisation: type "Ezhu Vlakkin" and the song already in
  // the library doesn't come back, so the obvious next move is to create it
  // again. Only the near misses the search itself didn't turn up are worth
  // showing — anything already in the list below speaks for itself.
  const missedBySearch = useMemo(
    () =>
      findSimilarSongs(search, songs).filter(
        (match) => !filtered.some((song) => song.id === match.song.id),
      ),
    [search, songs, filtered],
  )

  const pending = createItem.isPending || createSong.isPending

  function close() {
    onOpenChange(false)
    setSearch('')
    setArrangementStep(null)
    setSuggestion(null)
  }

  async function runSuggest(exclude: string[]) {
    try {
      const data = await suggest.mutateAsync({ planId, rejectedSongIds: exclude })
      if (data.exhausted || !data.songId) {
        setSuggestion(null)
        toast.info('No more songs to suggest for this plan.')
        return
      }
      setSuggestion({
        songId: data.songId,
        title: data.title ?? '',
        reason: data.reason ?? '',
        keyNote: data.keyNote ?? '',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not suggest a song')
    }
  }

  function acceptSuggestion() {
    if (!suggestion) return
    const song = songs.find((s) => s.id === suggestion.songId)
    setSuggestion(null)
    if (!song) {
      toast.error('That song is no longer in the library')
      return
    }
    // Adds in one click, or opens the arrangement step for a multi-arrangement
    // song — the same path as picking it from the list.
    void pickSong(song)
  }

  function rejectSuggestion() {
    if (!suggestion) return
    const next = [...rejected, suggestion.songId]
    setRejected(next)
    saveRejectedSongs(planId, next)
    setSuggestion(null)
    void runSuggest(next)
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

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search songs…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              {suggestAvailable.data && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => runSuggest(rejected)}
                  disabled={pending || suggest.isPending}
                  title="Suggest a song that fits the ones already on this plan"
                  aria-label="Suggest a song"
                >
                  {suggest.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </Button>
              )}
            </div>

            {suggestion && (
              <div className="border-primary/40 bg-primary/5 rounded-lg border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="text-primary size-4 shrink-0" />
                  <span className="truncate">{suggestion.title}</span>
                </p>
                {suggestion.reason && (
                  <p className="text-muted-foreground mt-1 text-xs">{suggestion.reason}</p>
                )}
                {suggestion.keyNote && (
                  <p className="text-muted-foreground mt-0.5 text-xs italic">
                    {suggestion.keyNote}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={acceptSuggestion} disabled={pending}>
                    <Check className="size-4" />
                    Add this
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rejectSuggestion}
                    disabled={pending || suggest.isPending}
                    title="Skip this one and suggest another"
                  >
                    {suggest.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <X className="size-4" />
                    )}
                    Not this one
                  </Button>
                </div>
              </div>
            )}

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
              <>
                {missedBySearch.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <p className="flex items-center gap-2 font-medium">
                      <TriangleAlert className="size-4 shrink-0" />
                      {missedBySearch.length === 1
                        ? 'Did you mean this one?'
                        : 'Did you mean one of these?'}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {missedBySearch.slice(0, MAX_SIMILAR_SHOWN).map(({ song }) => (
                        <li key={song.id}>
                          <button
                            type="button"
                            onClick={() => pickSong(song)}
                            disabled={pending}
                            className="text-left font-medium underline underline-offset-2 disabled:opacity-50"
                          >
                            {song.title}
                          </button>
                          {song.author ? ` — ${song.author}` : ''}
                          {song.status === 'archived' ? ' (archived)' : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button variant="outline" onClick={createAndAdd} disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Create “{search.trim()}” and add it
                </Button>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
