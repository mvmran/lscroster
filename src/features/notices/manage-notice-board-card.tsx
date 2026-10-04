import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { FileUp, Loader2, Upload, X } from 'lucide-react'
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
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { NoticeLink } from '@/features/notices/notice-board-card'
import {
  NOTICE_MAX_MB,
  NOTICE_MESSAGE_MAX,
  newNoticeSchema,
  useAddNotice,
  useDeleteNotice,
  useNotices,
  type Notice,
} from '@/features/notices/use-notices'

/**
 * Settings → Manage notice board (admins and coordinators): add a PDF with a
 * one-line description, or remove one. What's listed here is exactly what
 * everyone sees on Home.
 */
export function ManageNoticeBoardCard() {
  const { data: me } = useCurrentPerson()
  const { data: notices, isPending } = useNotices()
  const add = useAddNotice()
  const remove = useDeleteNotice()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage notice board</CardTitle>
        <CardDescription>
          PDFs everyone sees on Home — the user manual, a notice, a message of the
          day. Newest first.
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
                      {notice.file_name} · added{' '}
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
                  title="Remove this notice and its PDF"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
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
              placeholder="e.g. LSCroster user manual"
            />
          </div>
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
          {formError && <p className="text-destructive text-sm">{formError}</p>}
        </div>
      </CardContent>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this notice?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.message}” and its PDF will be removed from the notice
              board for everyone. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
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
