import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useChurchSettings,
  useUpdateChurchSettings,
} from '@/features/settings/use-church-settings'

type ChurchSettings = NonNullable<ReturnType<typeof useChurchSettings>['data']>

const NUDGE_MAX = 14
const REMINDER_MAX = 7

function JobsForm({ settings }: { settings: ChurchSettings }) {
  const update = useUpdateChurchSettings()
  const [nudge, setNudge] = useState(String(settings.request_nudge_days))
  const [reminder, setReminder] = useState(String(settings.reminder_days_before))
  const [notifyOnPublish, setNotifyOnPublish] = useState(settings.notify_on_publish)

  const nudgeNum = Number.parseInt(nudge, 10)
  const reminderNum = Number.parseInt(reminder, 10)
  const nudgeValid = Number.isInteger(nudgeNum) && nudgeNum >= 0 && nudgeNum <= NUDGE_MAX
  const reminderValid =
    Number.isInteger(reminderNum) && reminderNum >= 0 && reminderNum <= REMINDER_MAX

  const dirty =
    nudgeNum !== settings.request_nudge_days ||
    reminderNum !== settings.reminder_days_before ||
    notifyOnPublish !== settings.notify_on_publish

  function save() {
    update.mutate(
      {
        id: settings.id,
        values: {
          request_nudge_days: nudgeNum,
          reminder_days_before: reminderNum,
          notify_on_publish: notifyOnPublish,
        },
      },
      {
        onSuccess: () => toast.success('Scheduled jobs saved'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="job-nudge">Nudge unanswered requests</Label>
        <p className="text-muted-foreground text-xs">
          Days between follow-up emails to people who haven't responded, until
          they do. Set to <strong>0</strong> to turn nudges off.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="job-nudge"
            type="number"
            min={0}
            max={NUDGE_MAX}
            inputMode="numeric"
            className="w-24"
            value={nudge}
            onChange={(e) => setNudge(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">days (0–{NUDGE_MAX})</span>
        </div>
        {!nudgeValid && (
          <p className="text-destructive text-xs">Enter a whole number from 0 to {NUDGE_MAX}.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="job-reminder">Pre-service reminders</Label>
        <p className="text-muted-foreground text-xs">
          Days before a service to remind confirmed people. Set to{' '}
          <strong>0</strong> to turn reminders off.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="job-reminder"
            type="number"
            min={0}
            max={REMINDER_MAX}
            inputMode="numeric"
            className="w-24"
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">days (0–{REMINDER_MAX})</span>
        </div>
        {!reminderValid && (
          <p className="text-destructive text-xs">
            Enter a whole number from 0 to {REMINDER_MAX}.
          </p>
        )}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="job-publish"
          checked={notifyOnPublish}
          onCheckedChange={(c) => setNotifyOnPublish(c === true)}
          className="mt-0.5"
        />
        <label htmlFor="job-publish" className="cursor-pointer select-none">
          <span className="text-sm font-medium">Email on publish</span>
          <span className="text-muted-foreground block text-xs">
            Send the full plan summary to everyone rostered when a plan is
            published.
          </span>
        </label>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={update.isPending || !nudgeValid || !reminderValid}
            onClick={save}
          >
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Admin controls for the recurring email jobs (issue #88): the nudge cadence,
 * the pre-service reminder lead time, and the publish-email master switch — all
 * stored on church_settings and read by the reminders / publish Edge Functions.
 */
export function ScheduledJobsCard() {
  const { data: settings, isPending } = useChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled jobs</CardTitle>
        <CardDescription>
          The automatic emails LSCRoster sends, and when. Members can still opt
          out individually from their own profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending || !settings ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <JobsForm key={settings.updated_at} settings={settings} />
        )}
      </CardContent>
    </Card>
  )
}
