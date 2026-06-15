import { useMemo, useRef, useState } from 'react'
import {
  Clock,
  Download,
  FileText,
  Loader2,
  Music,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  buildLyricsSheet,
  formatStartTime,
  lyricsSheetMeta,
} from '@/features/services/service-utils'
import {
  useDeletePlanAttachment,
  useOpenPlanAttachment,
  usePlanAttachments,
  useUploadPlanAttachment,
} from '@/features/services/use-plan-attachments'
import { usePlanItems } from '@/features/services/use-plan-items'
import { usePlanTimeMutations, usePlanTimes } from '@/features/services/use-plan-times'
import { useSongs } from '@/features/services/use-songs'

const MAX_ATTACHMENT_MB = 25

/** Labelled times (rehearsal, service…) shown in My Schedule and emails. */
export function PlanTimesCard({
  planId,
  canManage,
}: {
  planId: string
  canManage: boolean
}) {
  const { data: times, isPending } = usePlanTimes(planId)
  const { add, remove } = usePlanTimeMutations(planId)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('')

  if (!canManage && (times ?? []).length === 0) return null

  function addTime() {
    if (!label.trim() || !time) return
    add.mutate(
      { label: label.trim(), start_time: `${time}:00` },
      {
        onSuccess: () => {
          setLabel('')
          setTime('')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Times</CardTitle>
        <CardDescription>
          Rehearsal and service times — included in scheduling emails and My
          Schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (times ?? []).length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Clock className="size-4" />
            No times added — emails fall back to the service type's start time.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(times ?? []).map((t) => (
              <li
                key={t.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t.label}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {formatStartTime(t.start_time)}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      remove.mutate(t.id, { onError: (e) => toast.error(e.message) })
                    }
                    aria-label={`Remove ${t.label}`}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addTime()
            }}
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Rehearsal"
              className="h-9 flex-1"
              aria-label="Time label"
            />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-9 w-32"
              aria-label="Start time"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={add.isPending || !label.trim() || !time}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/** Files on the plan itself (run sheets, stage layouts…). */
export function PlanAttachmentsCard({
  planId,
  canManage,
}: {
  planId: string
  canManage: boolean
}) {
  const { data: attachments, isPending } = usePlanAttachments(planId)
  const upload = useUploadPlanAttachment(planId)
  const remove = useDeletePlanAttachment(planId)
  const open = useOpenPlanAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!canManage && (attachments ?? []).length === 0) return null

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
        <CardDescription>
          Files for this plan — visible to everyone who can see the plan.
        </CardDescription>
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
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {attachment.label}
                </span>
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

/**
 * Media: a formatted lyrics sheet for the songs in this plan (issue #25). It is
 * derived from the order of service, so it always follows the setlist order and
 * updates when the setlist is reordered — there is nothing to edit here. Each
 * song shows its title, the Key/BPM/Meter from its Default arrangement, then its
 * lyrics.
 */
export function PlanMediaCard({
  planId,
  canManage,
}: {
  planId: string
  canManage: boolean
}) {
  const { data: items, isPending: itemsPending } = usePlanItems(planId)
  const { data: songs, isPending: songsPending } = useSongs()

  const songById = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs])
  const entries = useMemo(
    () => buildLyricsSheet(items ?? [], songById),
    [items, songById],
  )

  const isPending = itemsPending || songsPending

  // Hide entirely from members until there is something to show, mirroring the
  // other plan cards.
  if (!canManage && !isPending && entries.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media</CardTitle>
        <CardDescription>
          Lyrics sheet for the songs in this plan, in setlist order.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium">Lyrics Sheet</p>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Music className="size-4" />
            No songs in the order of service yet.
          </p>
        ) : (
          <div className="bg-muted/20 flex max-h-[28rem] flex-col gap-4 overflow-y-auto rounded-md border p-4">
            {entries.map((entry) => {
              const meta = lyricsSheetMeta(entry)
              const hasLyrics = !!entry.lyrics && entry.lyrics.trim().length > 0
              return (
                <div key={entry.songItemId} className="flex flex-col gap-1">
                  <h3 className="font-semibold leading-tight">{entry.title}</h3>
                  {meta && (
                    <p className="text-muted-foreground text-xs">{meta}</p>
                  )}
                  {hasLyrics ? (
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {entry.lyrics}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      No lyrics added
                      {canManage ? ' — add them on the song’s page.' : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
