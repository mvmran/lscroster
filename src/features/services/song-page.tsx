import { useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  FileMusic,
  Guitar,
  Link2,
  Loader2,
  Music,
  Paperclip,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
} from '@/features/services/service-utils'
import {
  useDeleteSongAttachment,
  useOpenSongAttachment,
  useSongAttachments,
  useUploadSongAttachment,
} from '@/features/services/use-song-attachments'
import {
  fetchDefaultLyrics,
  isLyricsVersionPinned,
  useArrangementLyrics,
  useArrangements,
  useCreateArrangement,
  useDeleteArrangement,
  useDeleteSong,
  useLinkSongToArrangement,
  useSaveArrangementLyrics,
  useSong,
  useSongHistory,
  useSongs,
  useSongUsage,
  useUnlinkSongFromArrangement,
  useUpdateArrangement,
  useUpdateSong,
  type ArrangementWithSongs,
} from '@/features/services/use-songs'

const MAX_ATTACHMENT_MB = 25

function DetailsCard({ song, canManage }: { song: Song; canManage: boolean }) {
  const updateSong = useUpdateSong()
  const [title, setTitle] = useState(song.title)
  const [author, setAuthor] = useState(song.author ?? '')
  const [ccli, setCcli] = useState(song.ccli_number ?? '')
  const [tags, setTags] = useState(song.tags.join(', '))

  const dirty =
    title !== song.title ||
    author !== (song.author ?? '') ||
    ccli !== (song.ccli_number ?? '') ||
    tags !== song.tags.join(', ')

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
  songId,
  arrangement,
  siblingNames,
  canManage,
}: {
  songId: string
  arrangement: ArrangementWithSongs
  /** Names of the song's other arrangements — uniqueness is app-checked (#130). */
  siblingNames: string[]
  canManage: boolean
}) {
  const update = useUpdateArrangement(songId)
  const remove = useDeleteArrangement(songId)
  const [name, setName] = useState(arrangement.name)
  const [songKey, setSongKey] = useState(arrangement.song_key ?? '')
  const [bpm, setBpm] = useState(arrangement.bpm?.toString() ?? '')
  const [meter, setMeter] = useState(arrangement.meter ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const bpmValue = bpm.trim() === '' ? null : Number(bpm)
  const bpmInvalid = bpmValue !== null && (!Number.isInteger(bpmValue) || bpmValue <= 0)
  const nameTaken = siblingNames.some(
    (n) => n.toLowerCase() === name.trim().toLowerCase(),
  )

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
    if (bpmInvalid || !name.trim() || nameTaken) return
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

  const isMedley = arrangement.linked_songs.length > 1

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
          {nameTaken && (
            <p className="text-destructive text-sm">
              This song already has an arrangement with that name
            </p>
          )}
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
            onClick={() => setConfirmDelete(true)}
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
            disabled={update.isPending || bpmInvalid || !name.trim() || nameTaken}
          >
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{arrangement.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes this arrangement, its lyrics and its attachments
              {isMedley ? ' — for every song in the medley' : ''}. Plans that
              used it keep their items, but lose the link back here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete arrangement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Pick a song from the library to link into a medley (#130). */
function LinkSongDialog({
  open,
  onOpenChange,
  excludeIds,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludeIds: string[]
  onPick: (song: { id: string; title: string }) => void
}) {
  const { data: songs } = useSongs()
  const [search, setSearch] = useState('')

  const term = search.trim().toLowerCase()
  const candidates = (songs ?? [])
    .filter((s) => s.status === 'active' && !excludeIds.includes(s.id))
    .filter(
      (s) =>
        term === '' || `${s.title} ${s.author ?? ''}`.toLowerCase().includes(term),
    )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a song</DialogTitle>
          <DialogDescription>
            The linked song’s lyrics are added to the end of this arrangement’s
            lyrics, and the arrangement appears under both songs.
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
          {candidates.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
              <Music className="size-6" />
              No songs match.
            </div>
          ) : (
            <ul className="flex flex-col">
              {candidates.map((song) => (
                <li key={song.id}>
                  <button
                    type="button"
                    onClick={() => onPick(song)}
                    className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{song.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {song.author ?? '—'}
                      </p>
                    </div>
                    {song.default_key && (
                      <Badge variant="secondary" className="shrink-0">
                        {song.default_key}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The linked-songs control + lyrics editor for one arrangement (#130). Linking
 * another song turns the arrangement into a medley: its junction row is added
 * and its Default lyrics are appended to the editor buffer (saved separately).
 * Lyrics are versioned — editing a version that a published plan pinned
 * creates a new version after warning, so past plans never change.
 */
function ArrangementLyricsBlock({
  song,
  arrangement,
  canManage,
}: {
  song: Song
  arrangement: ArrangementWithSongs
  canManage: boolean
}) {
  const { data: current, isPending: lyricsPending } = useArrangementLyrics(arrangement.id)
  const save = useSaveArrangementLyrics(arrangement.id)
  const link = useLinkSongToArrangement(song.id)
  const unlink = useUnlinkSongFromArrangement(song.id)
  const [lyrics, setLyrics] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [pendingLink, setPendingLink] = useState<{ id: string; title: string } | null>(null)
  const [pendingUnlink, setPendingUnlink] = useState<{ id: string; title: string } | null>(null)
  const [versionNotice, setVersionNotice] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)

  const value = lyrics ?? current?.lyrics ?? ''
  const dirty = value !== (current?.lyrics ?? '')
  const linkedSongs = arrangement.linked_songs

  async function onSaveClick() {
    setCheckingPin(true)
    try {
      const pinned = current ? await isLyricsVersionPinned(current.id) : false
      if (pinned) {
        setVersionNotice(true)
      } else {
        await doSave(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save lyrics')
    } finally {
      setCheckingPin(false)
    }
  }

  async function doSave(asNewVersion: boolean) {
    try {
      const saved = await save.mutateAsync({
        lyrics: value.trim(),
        current: current ?? null,
        asNewVersion,
      })
      setLyrics(null)
      toast.success(
        asNewVersion ? `Lyrics saved as version ${saved.version}` : 'Lyrics saved',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save lyrics')
    }
  }

  async function confirmLink() {
    const target = pendingLink
    if (!target) return
    setPendingLink(null)
    setLinkOpen(false)
    try {
      const nextSort =
        Math.max(-1, ...linkedSongs.map((s) => s.sort_order)) + 1
      await link.mutateAsync({
        arrangementId: arrangement.id,
        songId: target.id,
        sortOrder: nextSort,
      })
      const appended = await fetchDefaultLyrics(target.id)
      if (appended && appended.trim()) {
        setLyrics((value ? `${value.trimEnd()}\n\n` : '') + appended.trim())
        toast.success(`Linked ${target.title} — lyrics added below, save when ready`)
      } else {
        toast.success(`Linked ${target.title}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not link song')
    }
  }

  function confirmUnlink() {
    const target = pendingUnlink
    if (!target) return
    setPendingUnlink(null)
    unlink.mutate(
      { arrangementId: arrangement.id, songId: target.id },
      {
        onSuccess: () => toast.success(`Unlinked ${target.title}`),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  if (!canManage) {
    return (
      <div className="flex flex-col gap-3 border-t pt-4">
        {linkedSongs.length > 1 && <LinkedSongChips songs={linkedSongs} currentId={song.id} />}
        {lyricsPending ? (
          <Skeleton className="h-16 w-full" />
        ) : current?.lyrics ? (
          <pre className="text-muted-foreground font-sans text-sm whitespace-pre-wrap">
            {current.lyrics}
          </pre>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {!arrangement.is_default && (
        <div className="flex flex-col gap-2">
          <Label>Songs in this arrangement</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {linkedSongs.map((s) => (
              <Badge key={s.id} variant={s.id === song.id ? 'default' : 'secondary'}>
                {s.title}
                {linkedSongs.length > 1 && (
                  <button
                    type="button"
                    className="ml-1 opacity-70 hover:opacity-100"
                    onClick={() => setPendingUnlink(s)}
                    aria-label={`Unlink ${s.title}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </Badge>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => setLinkOpen(true)}
              disabled={link.isPending}
            >
              <Link2 className="size-3.5" />
              Link a song
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Link another song to make this a medley — it will appear under every
            linked song.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`arr-lyrics-${arrangement.id}`}>
          Lyrics / chord chart (optional)
          {current && (
            <span className="text-muted-foreground ml-1 font-normal">
              · version {current.version}
            </span>
          )}
        </Label>
        {lyricsPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <LyricsStructureEditor
            id={`arr-lyrics-${arrangement.id}`}
            value={value}
            onChange={setLyrics}
          />
        )}
        {dirty && (
          <div className="flex justify-end">
            <Button onClick={onSaveClick} disabled={save.isPending || checkingPin}>
              {(save.isPending || checkingPin) && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Save changes
            </Button>
          </div>
        )}
      </div>

      <LinkSongDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        excludeIds={linkedSongs.map((s) => s.id)}
        onPick={setPendingLink}
      />

      <AlertDialog open={!!pendingLink} onOpenChange={(o) => !o && setPendingLink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link “{pendingLink?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This arrangement becomes a medley shown under both songs, and the
              current lyrics of “{pendingLink?.title}” are added to the end of
              the lyrics editor — review and save them when you’re done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLink}>Link song</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingUnlink}
        onOpenChange={(o) => !o && setPendingUnlink(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink “{pendingUnlink?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The arrangement no longer appears under that song. The lyrics text
              is left as-is — edit it below if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlink}>Unlink</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={versionNotice} onOpenChange={setVersionNotice}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>These lyrics are on a published plan</AlertDialogTitle>
            <AlertDialogDescription>
              Version {current?.version} is locked into at least one published
              plan, so your edit will be saved as version{' '}
              {(current?.version ?? 0) + 1}. Published plans keep showing the
              version they were published with; drafts and future plans use the
              new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setVersionNotice(false)
                void doSave(true)
              }}
            >
              Save as new version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function LinkedSongChips({
  songs,
  currentId,
}: {
  songs: { id: string; title: string }[]
  currentId: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">Medley:</span>
      {songs.map((s) => (
        <Badge key={s.id} variant={s.id === currentId ? 'default' : 'secondary'}>
          {s.title}
        </Badge>
      ))}
    </div>
  )
}

/** Chord charts, sheet music, audio for one arrangement (#130). */
function AttachmentsSection({
  arrangementId,
  canManage,
}: {
  arrangementId: string
  canManage: boolean
}) {
  const { data: attachments, isPending } = useSongAttachments(arrangementId)
  const upload = useUploadSongAttachment(arrangementId)
  const remove = useDeleteSongAttachment(arrangementId)
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

  if (!canManage && (attachments ?? []).length === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <p className="text-sm font-medium">Attachments</p>
      {isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : !attachments || attachments.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Paperclip className="size-4" />
          No attachments for this arrangement yet.
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
    </div>
  )
}

function ArrangementsCard({ song, canManage }: { song: Song; canManage: boolean }) {
  const songId = song.id
  const { data: arrangements, isPending } = useArrangements(songId)
  const create = useCreateArrangement(songId)
  const [active, setActive] = useState<string | undefined>(undefined)

  const activeId = active ?? arrangements?.[0]?.id

  function addArrangement() {
    const existing = new Set(
      (arrangements ?? []).map((a) => a.name.toLowerCase()),
    )
    let n = arrangements?.length ?? 1
    while (existing.has(`arrangement ${n}`.toLowerCase())) n += 1
    create.mutate(
      { name: `Arrangement ${n}`, is_default: false, sort_order: n },
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
          Key, BPM and meter per arrangement, plus its lyrics and attachments.
          Every song has a Default; link songs into a non-default arrangement to
          make a medley.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending || !arrangements ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Tabs value={activeId} onValueChange={setActive} className="gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                {arrangements.map((a) => (
                  <TabsTrigger key={a.id} value={a.id}>
                    {a.name}
                    {a.linked_songs.length > 1 && (
                      <Link2 className="ml-1 size-3 opacity-60" />
                    )}
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
              <TabsContent key={a.id} value={a.id} className="flex flex-col gap-4">
                <ArrangementForm
                  key={a.updated_at}
                  songId={songId}
                  arrangement={a}
                  siblingNames={arrangements
                    .filter((s) => s.id !== a.id)
                    .map((s) => s.name)}
                  canManage={canManage}
                />
                <ArrangementLyricsBlock song={song} arrangement={a} canManage={canManage} />
                <AttachmentsSection arrangementId={a.id} canManage={canManage} />
              </TabsContent>
            ))}
          </Tabs>
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
                <li key={entry.plan_item_id}>
                  <Link
                    to={`/services/plans/${entry.plan_id}`}
                    className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="flex-1">{formatPlanDate(entry.date!)}</span>
                    {entry.key_override && (
                      <Badge variant="secondary">{entry.key_override}</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {entry.service_type_name}
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
      <ArrangementsCard song={song} canManage={canManage} />
      <UsageCard songId={song.id} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{song.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes the song, its arrangements, lyrics and attachments from
              the library. Medley arrangements shared with another song are
              kept. Plans that used it keep their items, but the link back to
              the library is removed. Consider archiving instead if it might
              come back.
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
