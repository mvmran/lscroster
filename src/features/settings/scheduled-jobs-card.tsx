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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useChurchSettings,
  useUpdateChurchSettings,
} from '@/features/settings/use-church-settings'
import {
  useRunScheduledJob,
  type ScheduledJob,
} from '@/features/settings/use-run-scheduled-job'

type ChurchSettings = NonNullable<ReturnType<typeof useChurchSettings>['data']>

const NUDGE_MAX = 14
const REMINDER_MAX = 7
const ROSTER_STATUS_MAX = 52

/** Format an hour-of-day (0–23) as a friendly local time, e.g. "9:00 AM". */
function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:00 ${period}`
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/**
 * Hour-of-day picker for when a job sends, in the church's timezone (issue
 * #120). Sits to the right of each job's number field.
 */
function HourSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: number
  onChange: (h: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">at</span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {formatHour(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** The small italic "(send now)" link after each job (issue #117). */
function SendNow({ job, label }: { job: ScheduledJob; label: string }) {
  const run = useRunScheduledJob()
  return (
    <button
      type="button"
      disabled={run.isPending}
      onClick={() =>
        run.mutate(job, {
          onSuccess: () =>
            toast.success(`Sending ${label} now — emails will go out shortly.`),
          onError: (e) => toast.error(e.message),
        })
      }
      className="text-muted-foreground hover:text-foreground ml-1 inline-flex items-center gap-1 text-xs italic underline-offset-2 hover:underline disabled:opacity-50"
    >
      {run.isPending && <Loader2 className="size-3 animate-spin" />}
      (send now)
    </button>
  )
}

function JobsForm({ settings }: { settings: ChurchSettings }) {
  const update = useUpdateChurchSettings()
  const [nudge, setNudge] = useState(String(settings.request_nudge_days))
  const [reminder, setReminder] = useState(String(settings.reminder_days_before))
  const [rosterWeeks, setRosterWeeks] = useState(
    String(settings.roster_status_weeks),
  )
  const [nudgeHour, setNudgeHour] = useState(settings.nudge_hour)
  const [reminderHour, setReminderHour] = useState(settings.reminder_hour)
  const [rosterHour, setRosterHour] = useState(settings.roster_status_hour)
  const [notifyOnPublish, setNotifyOnPublish] = useState(settings.notify_on_publish)

  const nudgeNum = Number.parseInt(nudge, 10)
  const reminderNum = Number.parseInt(reminder, 10)
  const rosterNum = Number.parseInt(rosterWeeks, 10)
  const nudgeValid = Number.isInteger(nudgeNum) && nudgeNum >= 0 && nudgeNum <= NUDGE_MAX
  const reminderValid =
    Number.isInteger(reminderNum) && reminderNum >= 0 && reminderNum <= REMINDER_MAX
  const rosterValid =
    Number.isInteger(rosterNum) && rosterNum >= 0 && rosterNum <= ROSTER_STATUS_MAX

  const dirty =
    nudgeNum !== settings.request_nudge_days ||
    reminderNum !== settings.reminder_days_before ||
    rosterNum !== settings.roster_status_weeks ||
    nudgeHour !== settings.nudge_hour ||
    reminderHour !== settings.reminder_hour ||
    rosterHour !== settings.roster_status_hour ||
    notifyOnPublish !== settings.notify_on_publish

  function save() {
    update.mutate(
      {
        id: settings.id,
        values: {
          request_nudge_days: nudgeNum,
          reminder_days_before: reminderNum,
          roster_status_weeks: rosterNum,
          nudge_hour: nudgeHour,
          reminder_hour: reminderHour,
          roster_status_hour: rosterHour,
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
        <Label htmlFor="job-nudge">
          Nudge unanswered requests
          <SendNow job="nudge" label="nudges" />
        </Label>
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
          <HourSelect id="job-nudge-hour" value={nudgeHour} onChange={setNudgeHour} />
        </div>
        {!nudgeValid && (
          <p className="text-destructive text-xs">Enter a whole number from 0 to {NUDGE_MAX}.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="job-reminder">
          Pre-service reminders
          <SendNow job="reminder" label="reminders" />
        </Label>
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
          <HourSelect
            id="job-reminder-hour"
            value={reminderHour}
            onChange={setReminderHour}
          />
        </div>
        {!reminderValid && (
          <p className="text-destructive text-xs">
            Enter a whole number from 0 to {REMINDER_MAX}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="job-roster-status">
          Upcoming roster status
          <SendNow job="roster-status" label="roster status" />
        </Label>
        <p className="text-muted-foreground text-xs">
          Weeks ahead the roster-status digest covers, emailed to Team Leaders,
          Team Viewers and admins. Set to <strong>0</strong> to turn it off.
        </p>
        <div className="flex items-center gap-2">
          <Input
            id="job-roster-status"
            type="number"
            min={0}
            max={ROSTER_STATUS_MAX}
            inputMode="numeric"
            className="w-24"
            value={rosterWeeks}
            onChange={(e) => setRosterWeeks(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">
            weeks (0–{ROSTER_STATUS_MAX})
          </span>
          <HourSelect
            id="job-roster-status-hour"
            value={rosterHour}
            onChange={setRosterHour}
          />
        </div>
        {!rosterValid && (
          <p className="text-destructive text-xs">
            Enter a whole number from 0 to {ROSTER_STATUS_MAX}.
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
            disabled={
              update.isPending || !nudgeValid || !reminderValid || !rosterValid
            }
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
 * Admin controls for the recurring email jobs (issues #88, #117): the nudge
 * cadence, the pre-service reminder lead time, the upcoming-roster-status
 * look-ahead, and the publish-email master switch — all stored on
 * church_settings and read by the reminders / publish Edge Functions. Each job
 * also has a "(send now)" link to run it on demand.
 */
export function ScheduledJobsCard() {
  const { data: settings, isPending } = useChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled jobs</CardTitle>
        <CardDescription>
          The automatic emails LSCroster sends, and when. Members can still opt
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
