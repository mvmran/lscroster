import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { FileText, FileUp, Link2, Loader2, Plus, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { NoticeLink } from '@/features/notices/notice-board-card'
import {
  NOTICE_LINK_MAX,
  NOTICE_MAX_MB,
  NOTICE_MESSAGE_MAX,
  newLinkNoticeSchema,
  newNoticeSchema,
  useAddLinkNotice,
  useAddNotice,
  useDeleteNotice,
  useNotices,
  type Notice,
} from '@/features/notices/use-notices'

/** "youtube.com" from a link notice's address, for the line under it. */
function siteOf(url: string | null) {
  try {
    return url ? new URL(url).host.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

/**
 * Settings → Manage notice board (admins and coordinators): add a PDF or a link
 * (a wiki page, a YouTube video — 0055) with a one-line description, or remove
 * one. What's listed here is exactly what everyone sees on Home.
 */
export function ManageNoticeBoardCard() {
  const { data: me } = useCurrentPerson()
  const { data: notices, isPending } = useNotices()
  const add = useAddNotice()
  const addLink = useAddLinkNotice()
  const remove = useDeleteNotice()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<'pdf' | 'link'>('pdf')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Notice | null>(null)

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setFormError(null)
    event.target.value = ''
  }

  function onUpload() {
    const parsed = newNoticeSchema.safeParse({ message, file })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the form')
      return
    }
    setFormError(null)
    add.mutate(
      { notice: parsed.data, createdBy: me?.id ?? null },
      {
        onSuccess: () => {
          toast.success('Added to the notice board')
          setMessage('')
          setFile(null)
        },
        onError: (e) => setFormError(e.message),
      },
    )
  }

  function onAddLink() {
    const parsed = newLinkNoticeSchema.safeParse({ message, url: link })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the form')
      return
    }
    setFormError(null)
    addLink.mutate(
      { notice: parsed.data, createdBy: me?.id ?? null },
      {
        onSuccess: () => {
          toast.success('Added to the notice board')
          setMessage('')
          setLink('')
        },
        onError: (e) => setFormError(e.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage notice board</CardTitle>
        <CardDescription>
          PDFs and links everyone sees on Home — the user manual, a notice, the
          church wiki, a YouTube video. Newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-11 w-full" />
        ) : !notices || notices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing on the notice board — Home doesn't show it until you add something.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {notices.map((notice) => (
              <li key={notice.id} className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <NoticeLink notice={notice}>
                    <span className="text-muted-foreground text-xs break-all">
                      {notice.kind === 'link' ? siteOf(notice.url) : notice.file_name} · added{' '}
                      {format(new Date(notice.created_at), 'd MMM yyyy')}
                    </span>
                  </NoticeLink>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-1 size-9 shrink-0"
                  onClick={() => setDeleting(notice)}
                  aria-label={`Remove ${notice.message}`}
                  title={notice.kind === 'link' ? 'Remove this link' : 'Remove this notice and its PDF'}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
          <ToggleGroup
            type="single"
            value={kind}
            onValueChange={(next) => {
              // A single toggle group reports '' when the pressed item is pressed again.
              if (next === 'pdf' || next === 'link') setKind(next)
              setFormError(null)
            }}
            className="self-start"
            aria-label="What to add"
          >
            <ToggleGroupItem value="pdf" title="Add a PDF" aria-label="PDF">
              <FileText className="size-4" />
              PDF
            </ToggleGroupItem>
            <ToggleGroupItem value="link" title="Add a link to a web page or video" aria-label="Link">
              <Link2 className="size-4" />
              Link
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-message">Description</Label>
            <Input
              id="notice-message"
              value={message}
              maxLength={NOTICE_MESSAGE_MAX}
              onChange={(e) => {
                setMessage(e.target.value)
                setFormError(null)
              }}
              placeholder={kind === 'link' ? 'e.g. Church wiki' : 'e.g. LSCroster user manual'}
            />
          </div>
          {kind === 'link' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notice-link">Web address</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="notice-link"
                  type="url"
                  inputMode="url"
                  value={link}
                  maxLength={NOTICE_LINK_MAX}
                  onChange={(e) => {
                    setLink(e.target.value)
                    setFormError(null)
                  }}
                  placeholder="https://…"
                  className="min-w-0 flex-1"
                />
                <Button
                  onClick={onAddLink}
                  disabled={addLink.isPending}
                  title="Add this link to the notice board"
                >
                  {addLink.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Add link
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onFileChosen}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                title={`Choose a PDF (max ${NOTICE_MAX_MB} MB)`}
              >
                <FileUp className="size-4" />
                {file ? 'Change PDF' : 'Choose PDF'}
              </Button>
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                {file ? file.name : `PDF only, up to ${NOTICE_MAX_MB} MB`}
              </span>
              <Button onClick={onUpload} disabled={add.isPending}>
                {add.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload
              </Button>
            </div>
          )}
          {formError && <p className="text-destructive text-sm">{formError}</p>}
        </div>
      </CardContent>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this notice?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.message}”
              {deleting?.kind === 'link' ? '' : ' and its PDF'} will be removed
              from the notice board for everyone. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return
                remove.mutate(deleting, {
                  onSuccess: () => toast.success('Notice removed'),
                  onError: (e) => toast.error(e.message),
                })
                setDeleting(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
