import { useMemo, useState } from 'react'
import { ChartColumn, Loader2, Music, Plus, Search, TriangleAlert, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { FullPageError } from '@/components/full-page-error'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  formatPlanDateShort,
  songSearchLinks,
  type Song,
} from '@/features/services/service-utils'
import {
  MAX_SIMILAR_SHOWN,
  findSimilarSongs,
} from '@/features/services/song-duplicates'
import { useCreateSong, useSongs, useSongUsage } from '@/features/services/use-songs'

function NewSongDialog({
  open,
  onOpenChange,
  songs,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  songs: Song[]
}) {
  const createSong = useCreateSong()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [ccli, setCcli] = useState('')

  // Warn, never block: the library is already loaded for the list behind this
  // dialog, so the check costs nothing and can run on every keystroke.
  const similar = useMemo(() => findSimilarSongs(title, songs), [title, songs])

  async function create() {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const song = await createSong.mutateAsync({
        title: trimmed,
        author: author.trim() || null,
        ccli_number: ccli.trim() || null,
      })
      onOpenChange(false)
      navigate(`/songs/${song.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create song')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New song</DialogTitle>
          <DialogDescription>
            Adds it to the library — attach charts from the song's page after.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ns-title">Title</Label>
            <Input
              id="ns-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          {similar.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4 shrink-0" />
                {similar.length === 1
                  ? 'This song may already be in the library'
                  : 'These songs may be the one you are adding'}
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                {similar.slice(0, MAX_SIMILAR_SHOWN).map(({ song }) => (
                  <li key={song.id}>
                    <Link
                      to={`/songs/${song.id}`}
                      className="font-medium underline underline-offset-2"
                      onClick={() => onOpenChange(false)}
                    >
                      {song.title}
                    </Link>
                    {song.author ? ` — ${song.author}` : ''}
                    {song.status === 'archived' ? ' (archived)' : ''}
                  </li>
                ))}
              </ul>
              {similar.length > MAX_SIMILAR_SHOWN && (
                <p className="mt-1">and {similar.length - MAX_SIMILAR_SHOWN} more</p>
              )}
              <p className="mt-2">
                Titles that read the same in the original script can be spelled several ways
                here. Open one to check — or carry on if this really is a different song.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="ns-author">Author / artist</Label>
            <Input id="ns-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          {title.trim() && (
            <Button
              variant="link"
              size="sm"
              className="h-auto justify-start self-start p-0"
              asChild
            >
              <a
                href={songSearchLinks(title, author).lyrics}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Search className="size-3.5" />
                Search the web for lyrics
              </a>
            </Button>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="ns-ccli">CCLI number</Label>
            <Input id="ns-ccli" value={ccli} onChange={(e) => setCcli(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={createSong.isPending || !title.trim()}>
            {createSong.isPending && <Loader2 className="size-4 animate-spin" />}
            {similar.length > 0 ? 'Create anyway' : 'Create song'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The status choices, and the guard against a hand-edited `?status=`. */
const STATUS_FILTERS = ['active', 'archived', 'all']

function matchesSearch(song: Song, term: string) {
  return `${song.title} ${song.author ?? ''} ${song.ccli_number ?? ''} ${song.tags.join(' ')}`
    .toLowerCase()
    .includes(term)
}

export function SongsPage() {
  const { data: songs, isPending, isError, error } = useSongs()
  const { data: usage } = useSongUsage()
  const { data: me } = useCurrentPerson()
  const navigate = useNavigate()

  // The three filters live in the URL (`?q=`, `?tag=`, `?status=`), not in
  // component state: opening a song and coming back — with the Back arrow or
  // the browser's — then returns to the list you were actually looking at,
  // the same way the services list keeps its `?type=`. Every song link below
  // carries them forward so the song screen knows where you came from.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  // A tag that has since been renamed away (or a hand-edited URL) falls back
  // to showing everything rather than an empty list under a blank filter.
  // While the songs are still loading, trust the URL so the list doesn't
  // flicker through "no matches" on the way in.
  const tagParam = searchParams.get('tag')
  const tagFilter =
    tagParam && (songs?.some((s) => s.tags.includes(tagParam)) ?? true) ? tagParam : 'all'
  const statusParam = searchParams.get('status') ?? 'active'
  const statusFilter = STATUS_FILTERS.includes(statusParam) ? statusParam : 'active'
  // Only non-default values are written, so an untouched list stays at a bare
  // `/songs`. replace: the filters are a view of this page, not places to go
  // Back through one keystroke at a time.
  const setFilters = (next: { q?: string; tag?: string; status?: string }) => {
    const merged = { q: search, tag: tagFilter, status: statusFilter, ...next }
    const params: Record<string, string> = {}
    if (merged.q !== '') params.q = merged.q
    if (merged.tag !== 'all') params.tag = merged.tag
    if (merged.status !== 'active') params.status = merged.status
    setSearchParams(params, { replace: true })
  }
  const [newSongOpen, setNewSongOpen] = useState(false)

  const canManage = me?.role === 'admin' || me?.role === 'leader'

  const allTags = useMemo(
    () => [...new Set((songs ?? []).flatMap((s) => s.tags))].sort(),
    [songs],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (songs ?? []).filter(
      (s) =>
        (term === '' || matchesSearch(s, term)) &&
        (statusFilter === 'all' || s.status === statusFilter) &&
        (tagFilter === 'all' || s.tags.includes(tagFilter)),
    )
  }, [songs, search, statusFilter, tagFilter])

  if (isError) return <FullPageError message={error.message} />

  // Passed to every song link so the song screen's Back arrow comes back to
  // this filtered list, not to a reset one (nothing to pass when nothing is
  // filtered). The browser's own Back needs no help — it returns to this URL.
  const songSearch = searchParams.toString() === '' ? '' : `?${searchParams}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Songs"
        count={songs ? filtered.length : undefined}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/songs/reports" title="See how often each song has been used">
                <ChartColumn className="size-4" />
                <span className="hidden sm:inline">Usage</span>
              </Link>
            </Button>
            {canManage && (
              <Button onClick={() => setNewSongOpen(true)}>
                <Plus className="size-4" />
                Add song
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setFilters({ q: e.target.value })}
            placeholder="Search by title, author or CCLI…"
            className="pl-9 pr-9"
            aria-label="Search songs"
          />
          {search !== '' && (
            <button
              type="button"
              onClick={() => setFilters({ q: '' })}
              // Full-height hit area: on a phone the glyph alone is a smaller
              // target than a thumb, and this sits beside the text you are
              // trying to tap into.
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-9 items-center justify-center"
              aria-label="Clear search"
              title="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {allTags.length > 0 && (
            <Select value={tagFilter} onValueChange={(tag) => setFilters({ tag })}>
              <SelectTrigger className="flex-1 sm:w-36" aria-label="Filter by tag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={(status) => setFilters({ status })}>
            <SelectTrigger className="flex-1 sm:w-32" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Music}
          title={
            songs?.length === 0
              ? 'No songs yet. Add your first song to start building the library.'
              : 'No songs match your search.'
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((song) => {
              const lastUsed = usage?.[song.id]?.last_used ?? null
              return (
                <Link key={song.id} to={`/songs/${song.id}${songSearch}`}>
                  <Card className="py-3 transition-colors active:bg-accent">
                    <CardContent className="flex items-center gap-3 px-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{song.title}</span>
                          {song.status === 'archived' && (
                            <Badge variant="outline">Archived</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground truncate text-sm">
                          {[song.author, lastUsed ? `last: ${formatPlanDateShort(lastUsed)}` : null]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </div>
                      {song.default_key && (
                        <Badge variant="secondary">{song.default_key}</Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>

          {/* Desktop table */}
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Last scheduled</TableHead>
                  <TableHead className="text-right">Uses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((song) => {
                  const stats = usage?.[song.id]
                  return (
                    <TableRow
                      key={song.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/songs/${song.id}${songSearch}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{song.title}</span>
                          {song.status === 'archived' && (
                            <Badge variant="outline">Archived</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {song.author ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {song.default_key ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {song.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {stats?.last_used ? formatPlanDateShort(stats.last_used) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right">
                        {stats?.use_count ?? 0}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <NewSongDialog open={newSongOpen} onOpenChange={setNewSongOpen} songs={songs ?? []} />
    </div>
  )
}
