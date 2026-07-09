import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { usePeople } from '@/features/people/use-people'
import { useTeams } from '@/features/scheduling/use-teams'
import {
  useChurchSettings,
  useUpdateChurchSettings,
} from '@/features/settings/use-church-settings'
import {
  useRunScheduledJob,
  type ScheduledJob,
} from '@/features/settings/use-run-scheduled-job'
import {
  useAddSetlistRecipient,
  useRemoveSetlistRecipient,
  useSetlistRecipients,
} from '@/features/settings/use-setlist-recipients'

type ChurchSettings = NonNullable<ReturnType<typeof useChurchSettings>['data']>

const NUDGE_MAX = 14
const REMINDER_MAX = 7
const ROSTER_STATUS_MAX = 52
/** Above this the recipients control warns the list is getting expensive. */
const SETLIST_SOFT_WARN = 20

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

/**
 * The worship set-list distribution list (issue #133): the people and teams
 * the set-list email + PDF goes to when a plan is published. Additions and
 * removals save immediately. Because each recipient is an individual Resend
 * call (attachments can't batch), the control nudges the admin to keep the
 * list small.
 */
function SetlistRecipientsControl() {
  const { data: recipients, isPending } = useSetlistRecipients()
  const { data: people } = usePeople()
  const { data: teams } = useTeams()
  const add = useAddSetlistRecipient()
  const remove = useRemoveSetlistRecipient()

  if (isPending || !recipients) return <Skeleton className="h-16 w-full" />

  const chosenPersonIds = new Set(
    recipients.filter((r) => r.person_id).map((r) => r.person_id),
  )
  const chosenTeamIds = new Set(
    recipients.filter((r) => r.team_id).map((r) => r.team_id),
  )
  const availablePeople = (people ?? []).filter(
    (p) => p.status === 'active' && !chosenPersonIds.has(p.id),
  )
  const availableTeams = (teams ?? []).filter((t) => !chosenTeamIds.has(t.id))
  const memberCount = (teamId: string) =>
    teams?.find((t) => t.id === teamId)?.team_members[0]?.count ?? 0

  // Rough send count: direct people + team members (overlaps are deduplicated
  // at send time, so the real number is at most this).
  const estimated =
    chosenPersonIds.size +
    [...chosenTeamIds].reduce((sum, id) => sum + memberCount(id ?? ''), 0)

  const onError = (e: Error) => toast.error(e.message)

  return (
    <div className="flex flex-col gap-2">
      {recipients.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipients.map((r) => (
            <Badge key={r.id} variant="secondary" className="gap-1 pr-1">
              {r.team_id
                ? `${r.teams?.name ?? 'Team'} (team · ${memberCount(r.team_id)})`
                : `${r.people?.first_name ?? ''} ${r.people?.last_name ?? ''}`.trim()}
              <button
                type="button"
                aria-label="Remove recipient"
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id, { onError })}
                className="hover:bg-muted-foreground/20 rounded-full p-0.5 disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Select
          value=""
          onValueChange={(personId) => add.mutate({ personId }, { onError })}
          disabled={add.isPending || availablePeople.length === 0}
        >
          <SelectTrigger className="w-44" aria-label="Add a person">
            <SelectValue placeholder="Add a person…" />
          </SelectTrigger>
          <SelectContent>
            {availablePeople.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value=""
          onValueChange={(teamId) => add.mutate({ teamId }, { onError })}
          disabled={add.isPending || availableTeams.length === 0}
        >
          <SelectTrigger className="w-44" aria-label="Add a team">
            <SelectValue placeholder="Add a team…" />
          </SelectTrigger>
          <SelectContent>
            {availableTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({t.team_members[0]?.count ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {recipients.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No recipients yet — the set list won't be emailed until you add some.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          About {estimated} {estimated === 1 ? 'email' : 'emails'} per publish.
        </p>
      )}
      {estimated > SETLIST_SOFT_WARN && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Each set-list email carries the PDF and is sent individually (Resend
          allows 2/second) — keep this list to the people who really need it.
        </p>
      )}
    </div>
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
  const [sendSetlist, setSendSetlist] = useState(settings.send_setlist_on_publish)

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
    notifyOnPublish !== settings.notify_on_publish ||
    sendSetlist !== settings.send_setlist_on_publish

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
          send_setlist_on_publish: sendSetlist,
        },
      },
      {
        onSuccess: () => toast.success('Communications setup saved'),
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

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Checkbox
            id="job-setlist"
            checked={sendSetlist}
            onCheckedChange={(c) => setSendSetlist(c === true)}
            className="mt-0.5"
          />
          <label htmlFor="job-setlist" className="cursor-pointer select-none">
            <span className="text-sm font-medium">Worship set list on publish</span>
            <span className="text-muted-foreground block text-xs">
              Email the polished set-list PDF (songs, keys, links, flow notes)
              to the recipients below when a plan is published. Leaders can also
              send it from a plan's ⋯ menu at any time.
            </span>
          </label>
        </div>
        <div className="pl-7">
          <SetlistRecipientsControl />
        </div>
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
 * Admin controls for everything LSCroster emails automatically (issues #88,
 * #117, #133): the nudge cadence, the pre-service reminder lead time, the
 * upcoming-roster-status look-ahead, the publish-email master switch and the
 * worship set-list send — all stored on church_settings (plus the
 * setlist_recipients list) and read by the reminders / publish / set-list
 * Edge Functions. Each scheduled job also has a "(send now)" link.
 */
export function CommunicationsSetupCard() {
  const { data: settings, isPending } = useChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Communications setup</CardTitle>
        <CardDescription>
          The automatic emails LSCroster sends, when, and to whom. Members can
          still opt out individually from their own profile.
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
