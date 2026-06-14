import { useMemo, useState } from 'react'
import { ChartColumn, Loader2, Music, Plus, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
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
import { useCreateSong, useSongs, useSongUsage } from '@/features/services/use-songs'

function NewSongDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createSong = useCreateSong()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [ccli, setCcli] = useState('')

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
            Create song
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [tagFilter, setTagFilter] = useState('all')
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          Songs
          {songs && (
            <span className="text-muted-foreground ml-2 text-base font-normal">
              {filtered.length}
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/songs/reports">
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
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author or CCLI…"
            className="pl-9"
            aria-label="Search songs"
          />
        </div>
        <div className="flex gap-2">
          {allTags.length > 0 && (
            <Select value={tagFilter} onValueChange={setTagFilter}>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <Music className="size-8" />
            {songs?.length === 0
              ? 'No songs yet. Add your first song to start building the library.'
              : 'No songs match your search.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((song) => {
              const lastUsed = usage?.[song.id]?.last_used ?? null
              return (
                <Link key={song.id} to={`/songs/${song.id}`}>
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
                      onClick={() => navigate(`/songs/${song.id}`)}
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

      <NewSongDialog open={newSongOpen} onOpenChange={setNewSongOpen} />
    </div>
  )
}
