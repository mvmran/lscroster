import { useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  FileMusic,
  Guitar,
  Loader2,
  Music,
  Paperclip,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { LyricsStructureEditor } from '@/features/services/lyrics-structure-editor'
import {
  formatPlanDate,
  formatPlanDateShort,
  parseTagsInput,
  songSearchLinks,
  type Song,
  type SongArrangement,
} from '@/features/services/service-utils'
import {
  useDeleteSongAttachment,
  useOpenSongAttachment,
  useSongAttachments,
  useUploadSongAttachment,
} from '@/features/services/use-song-attachments'
import {
  useArrangements,
  useCreateArrangement,
  useDeleteArrangement,
  useDeleteSong,
  useSong,
  useSongHistory,
  useSongUsage,
  useUpdateArrangement,
  useUpdateSong,
} from '@/features/services/use-songs'

const MAX_ATTACHMENT_MB = 25

function DetailsCard({ song, canManage }: { song: Song; canManage: boolean }) {
  const updateSong = useUpdateSong()
  const [title, setTitle] = useState(song.title)
  const [author, setAuthor] = useState(song.author ?? '')
  const [ccli, setCcli] = useState(song.ccli_number ?? '')
  const [tags, setTags] = useState(song.tags.join(', '))
  const [lyrics, setLyrics] = useState(song.lyrics ?? '')

  const dirty =
    title !== song.title ||
    author !== (song.author ?? '') ||
    ccli !== (song.ccli_number ?? '') ||
    tags !== song.tags.join(', ') ||
    lyrics !== (song.lyrics ?? '')

  async function save() {
    if (!title.trim()) return
    try {
      await updateSong.mutateAsync({
        id: song.id,
        values: {
          title: title.trim(),
          author: author.trim() || null,
          ccli_number: ccli.trim() || null,
          tags: parseTagsInput(tags),
          lyrics: lyrics.trim() || null,
        },
      })
      toast.success('Song saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save song')
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">CCLI</dt>
              <dd className="font-medium">{song.ccli_number ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Tags</dt>
              <dd className="font-medium">{song.tags.join(', ') || '—'}</dd>
            </div>
          </dl>
          {song.lyrics && (
            <pre className="text-muted-foreground mt-4 font-sans text-sm whitespace-pre-wrap">
              {song.lyrics}
            </pre>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sd-title">Title</Label>
          <Input id="sd-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sd-author">Author / artist</Label>
            <Input id="sd-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sd-ccli">CCLI number</Label>
            <Input id="sd-ccli" value={ccli} onChange={(e) => setCcli(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sd-tags">Tags</Label>
          <Input
            id="sd-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="fast, opener, christmas — comma separated"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sd-lyrics">Lyrics / chord chart (optional)</Label>
          <LyricsStructureEditor id="sd-lyrics" value={lyrics} onChange={setLyrics} />
        </div>
        {dirty && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={updateSong.isPending || !title.trim()}>
              {updateSong.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ArrangementForm({
  arrangement,
  canManage,
}: {
  arrangement: SongArrangement
  canManage: boolean
}) {
  const update = useUpdateArrangement(arrangement.song_id)
  const remove = useDeleteArrangement(arrangement.song_id)
  const [name, setName] = useState(arrangement.name)
  const [songKey, setSongKey] = useState(arrangement.song_key ?? '')
  const [bpm, setBpm] = useState(arrangement.bpm?.toString() ?? '')
  const [meter, setMeter] = useState(arrangement.meter ?? '')

  const bpmValue = bpm.trim() === '' ? null : Number(bpm)
  const bpmInvalid = bpmValue !== null && (!Number.isInteger(bpmValue) || bpmValue <= 0)

  const dirty =
    name.trim() !== arrangement.name ||
    songKey !== (arrangement.song_key ?? '') ||
    bpm !== (arrangement.bpm?.toString() ?? '') ||
    meter !== (arrangement.meter ?? '')

  if (!canManage) {
    return (
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Key</dt>
          <dd className="font-medium">{arrangement.song_key ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">BPM</dt>
          <dd className="font-medium">{arrangement.bpm ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Meter</dt>
          <dd className="font-medium">{arrangement.meter ?? '—'}</dd>
        </div>
      </dl>
    )
  }

  function save() {
    if (bpmInvalid || !name.trim()) return
    update.mutate(
      {
        id: arrangement.id,
        values: {
          name: name.trim(),
          song_key: songKey.trim() || null,
          bpm: bpmValue,
          meter: meter.trim() || null,
        },
      },
      {
        onSuccess: () => toast.success('Arrangement saved'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function onDelete() {
    remove.mutate(arrangement.id, {
      onSuccess: () => toast.success('Arrangement removed'),
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {!arrangement.is_default && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`arr-name-${arrangement.id}`}>Arrangement name</Label>
          <Input
            id={`arr-name-${arrangement.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`arr-key-${arrangement.id}`}>Key</Label>
          <Input
            id={`arr-key-${arrangement.id}`}
            value={songKey}
            onChange={(e) => setSongKey(e.target.value)}
            placeholder="e.g. G"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`arr-bpm-${arrangement.id}`}>BPM</Label>
          <Input
            id={`arr-bpm-${arrangement.id}`}
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            inputMode="numeric"
          />
          {bpmInvalid && <p className="text-destructive text-sm">Whole number above 0</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`arr-meter-${arrangement.id}`}>Meter</Label>
          <Input
            id={`arr-meter-${arrangement.id}`}
            value={meter}
            onChange={(e) => setMeter(e.target.value)}
            placeholder="e.g. 4/4"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {arrangement.is_default ? (
          <span />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={remove.isPending}
          >
            <Trash2 className="size-4" />
            Delete arrangement
          </Button>
        )}
        {dirty && (
          <Button
            size="sm"
            onClick={save}
            disabled={update.isPending || bpmInvalid || !name.trim()}
          >
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        )}
      </div>
    </div>
  )
}

function ArrangementsCard({ songId, canManage }: { songId: string; canManage: boolean }) {
  const { data: arrangements, isPending } = useArrangements(songId)
  const create = useCreateArrangement(songId)
  const [active, setActive] = useState<string | undefined>(undefined)

  const activeId = active ?? arrangements?.[0]?.id

  function addArrangement() {
    const count = arrangements?.length ?? 1
    create.mutate(
      { name: `Arrangement ${count}`, is_default: false, sort_order: count },
      {
        onSuccess: (created) => {
          setActive(created.id)
          toast.success('Arrangement added')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arrangements</CardTitle>
        <CardDescription>
          Key, BPM and meter per arrangement. Every song has a Default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending || !arrangements ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Tabs value={activeId} onValueChange={setActive} className="gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                {arrangements.map((a) => (
                  <TabsTrigger key={a.id} value={a.id}>
                    {a.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addArrangement}
                  disabled={create.isPending}
                >
                  {create.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Add arrangement
                </Button>
              )}
            </div>
            {arrangements.map((a) => (
              <TabsContent key={a.id} value={a.id}>
                <ArrangementForm key={a.updated_at} arrangement={a} canManage={canManage} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

function AttachmentsCard({ songId, canManage }: { songId: string; canManage: boolean }) {
  const { data: attachments, isPending } = useSongAttachments(songId)
  const upload = useUploadSongAttachment(songId)
  const remove = useDeleteSongAttachment(songId)
  const open = useOpenSongAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      toast.error(`Files must be under ${MAX_ATTACHMENT_MB} MB`)
      return
    }
    upload.mutate(file, {
      onSuccess: () => toast.success(`Uploaded ${file.name}`),
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
        <CardDescription>Chord charts, sheet music, audio — visible to everyone.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : !attachments || attachments.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Paperclip className="size-4" />
            No attachments yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <FileMusic className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">{attachment.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    open.mutate(attachment, { onError: (e) => toast.error(e.message) })
                  }
                  aria-label={`Download ${attachment.label}`}
                >
                  <Download className="size-4" />
                </Button>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      remove.mutate(attachment, {
                        onSuccess: () => toast.success('Attachment removed'),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                    aria-label={`Delete ${attachment.label}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileChosen}
              accept=".pdf,.png,.jpg,.jpeg,.txt,.cho,.crd,.onsong,.mp3,.m4a,.wav,.musicxml,.mxl"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload file
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UsageCard({ songId }: { songId: string }) {
  const { data: usage } = useSongUsage()
  const { data: history, isPending } = useSongHistory(songId)
  const stats = usage?.[songId]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduling</CardTitle>
        <CardDescription>
          {stats
            ? [
                stats.last_used ? `Last scheduled ${formatPlanDateShort(stats.last_used)}` : null,
                stats.next_scheduled
                  ? `next ${formatPlanDateShort(stats.next_scheduled)}`
                  : null,
                `${stats.use_count ?? 0} plan${(stats.use_count ?? 0) === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Never scheduled yet.'}
        </CardDescription>
      </CardHeader>
      {(isPending || (history && history.length > 0)) && (
        <CardContent>
          {isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <ul className="flex flex-col gap-1">
              {history!.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to={`/services/plans/${entry.plans.id}`}
                    className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="flex-1">{formatPlanDate(entry.plans.date)}</span>
                    {entry.key_override && (
                      <Badge variant="secondary">{entry.key_override}</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {entry.plans.service_types?.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export function SongPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: me } = useCurrentPerson()
  const { data: song, isPending, isError, error } = useSong(id)
  const updateSong = useUpdateSong()
  const deleteSong = useDeleteSong()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canManage = me?.role === 'admin' || me?.role === 'leader'

  if (isError) return <FullPageError message={error.message} />
  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!song) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
        <Music className="size-8" />
        <p>This song doesn’t exist.</p>
        <Button variant="outline" asChild>
          <Link to="/songs">Back to songs</Link>
        </Button>
      </div>
    )
  }

  function toggleArchived() {
    const next = song!.status === 'active' ? 'archived' : 'active'
    updateSong.mutate(
      { id: song!.id, values: { status: next } },
      {
        onSuccess: () =>
          toast.success(next === 'archived' ? 'Song archived' : 'Song restored'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  async function confirmDeleteSong() {
    try {
      await deleteSong.mutateAsync(song!.id)
      toast.success('Song deleted')
      navigate('/songs')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete song')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
          <Link to="/songs">
            <ArrowLeft className="size-4" />
            Songs
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{song.title}</h1>
              {song.status === 'archived' && <Badge variant="outline">Archived</Badge>}
            </div>
            {song.author && <p className="text-muted-foreground text-sm">{song.author}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={songSearchLinks(song.title, song.author).lyrics}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Search className="size-4" />
                  Lyrics
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={songSearchLinks(song.title, song.author).chords}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Guitar className="size-4" />
                  Chords
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={songSearchLinks(song.title, song.author).listen}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Play className="size-4" />
                  Listen
                </a>
              </Button>
            </div>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleArchived}
                disabled={updateSong.isPending}
              >
                {song.status === 'active' ? (
                  <Archive className="size-4" />
                ) : (
                  <ArchiveRestore className="size-4" />
                )}
                {song.status === 'active' ? 'Archive' : 'Restore'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      <DetailsCard key={song.updated_at} song={song} canManage={canManage} />
      <ArrangementsCard songId={song.id} canManage={canManage} />
      <AttachmentsCard songId={song.id} canManage={canManage} />
      <UsageCard songId={song.id} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{song.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the song and its attachments from the library. Plans that
              used it keep their items, but the link back to the library is
              removed. Consider archiving instead if it might come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSong}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSong.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete song
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
