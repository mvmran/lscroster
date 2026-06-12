import { useRef, useState } from 'react'
import { Clock, Download, FileText, Loader2, Paperclip, Plus, Trash2, Upload, X } from 'lucide-react'
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
import { formatStartTime } from '@/features/services/service-utils'
import {
  useDeletePlanAttachment,
  useOpenPlanAttachment,
  usePlanAttachments,
  useUploadPlanAttachment,
} from '@/features/services/use-plan-attachments'
import { usePlanTimeMutations, usePlanTimes } from '@/features/services/use-plan-times'

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
