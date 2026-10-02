import { useState } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  EMAIL_PREF_DEFAULTS,
  useUpsertPersonEmailPrefs,
  usePersonEmailPrefs,
  type EmailPrefKey,
  type PersonEmailPrefs,
} from '@/features/people/use-email-prefs'

const OPTIONS: { key: EmailPrefKey; label: string; description: string }[] = [
  {
    key: 'roster_emails',
    label: 'Roster changes',
    description: 'When added to or removed from a plan.',
  },
  {
    key: 'nudge_emails',
    label: 'Response reminders',
    description: "Follow-ups when a request hasn't been answered yet.",
  },
  {
    key: 'reminder_emails',
    label: 'Service reminders',
    description: 'Reminders before a service they are rostered on.',
  },
  {
    key: 'publish_emails',
    label: 'Published plans',
    description: 'The full plan summary when a plan they are on is published.',
  },
  {
    key: 'roster_status_emails',
    label: 'Upcoming roster status',
    description:
      'A digest of rostering progress for the teams they lead or view (Team Leaders, Team Viewers and admins).',
  },
]

function PrefsForm({
  personId,
  prefs,
}: {
  personId: string
  prefs: PersonEmailPrefs | null
}) {
  const upsert = useUpsertPersonEmailPrefs(personId)
  const [values, setValues] = useState<Record<EmailPrefKey, boolean>>({
    roster_emails: prefs?.roster_emails ?? EMAIL_PREF_DEFAULTS.roster_emails,
    nudge_emails: prefs?.nudge_emails ?? EMAIL_PREF_DEFAULTS.nudge_emails,
    reminder_emails: prefs?.reminder_emails ?? EMAIL_PREF_DEFAULTS.reminder_emails,
    publish_emails: prefs?.publish_emails ?? EMAIL_PREF_DEFAULTS.publish_emails,
    roster_status_emails:
      prefs?.roster_status_emails ?? EMAIL_PREF_DEFAULTS.roster_status_emails,
  })

  function toggle(key: EmailPrefKey, next: boolean) {
    setValues((current) => ({ ...current, [key]: next }))
    // Write only the column that changed. The upsert updates just the columns
    // it is sent (a new row takes the others' defaults, all on), so two quick
    // toggles of different boxes can land in either order — sending the whole
    // row let an older save arrive last and quietly undo the other box.
    upsert.mutate({ [key]: next }, {
      onError: (e) => {
        // Undo only this box: another toggle may have gone through meanwhile.
        setValues((current) => ({ ...current, [key]: !next }))
        toast.error(e.message)
      },
    })
  }

  return (
    <ul className="flex flex-col gap-3">
      {OPTIONS.map((o) => (
        <li key={o.key} className="flex items-start gap-3">
          <Checkbox
            id={`emailpref-${o.key}`}
            checked={values[o.key]}
            onCheckedChange={(c) => toggle(o.key, c === true)}
            className="mt-0.5"
          />
          <label htmlFor={`emailpref-${o.key}`} className="cursor-pointer select-none">
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-muted-foreground block text-xs">
              {o.description}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

/**
 * Per-person email opt-outs (issue #87). Every option is on by default; the
 * person, a coordinator or an admin can switch any of them off. Each toggle saves
 * immediately.
 */
export function PersonEmailPrefsCard({ personId }: { personId: string }) {
  const { data: prefs, isPending } = usePersonEmailPrefs(personId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email preferences</CardTitle>
        <CardDescription>
          Which emails this person receives. All are on unless switched off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          // Keyed by person, not by `updated_at`: the form's own state is the
          // source of truth once loaded. Keying on `updated_at` remounted it after
          // every save, and with toggles no longer locked a second quick tick
          // could be reset mid-flight by the first save's refetch.
          <PrefsForm key={personId} personId={personId} prefs={prefs ?? null} />
        )}
      </CardContent>
    </Card>
  )
}
