import { useMemo, useState } from 'react'
import { Loader2, Music, Plus, Search } from 'lucide-react'
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
  DEFAULT_ITEM_LENGTH,
  formatPlanDateShort,
  type Song,
} from '@/features/services/service-utils'
import { useCreatePlanItem } from '@/features/services/use-plan-items'
import { useCreateSong, useSongUsage } from '@/features/services/use-songs'

/**
 * Pick a song from the library to add to the order of service. Shows when each
 * song was last scheduled so leaders avoid repeating songs week to week.
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

  async function addSong(song: Song) {
    try {
      await createItem.mutateAsync({
        kind: 'song',
        title: song.title,
        song_id: song.id,
        length_seconds: DEFAULT_ITEM_LENGTH.song,
        sort_order: itemCount,
      })
      onOpenChange(false)
      setSearch('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add song')
    }
  }

  async function createAndAdd() {
    const title = search.trim()
    if (!title) return
    try {
      const song = await createSong.mutateAsync({ title })
      await addSong(song)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create song')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-lg">
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
                return (
                  <li key={song.id}>
                    <button
                      type="button"
                      onClick={() => addSong(song)}
                      disabled={pending}
                      className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{song.title}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {[song.author, lastUsed ? `last: ${formatPlanDateShort(lastUsed)}` : null]
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
      </DialogContent>
    </Dialog>
  )
}
