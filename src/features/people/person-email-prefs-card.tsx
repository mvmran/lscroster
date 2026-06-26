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
    const updated = { ...values, [key]: next }
    setValues(updated)
    upsert.mutate(updated, {
      onError: (e) => {
        setValues(values) // revert
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
            disabled={upsert.isPending}
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
 * person, a leader or an admin can switch any of them off. Each toggle saves
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
          <PrefsForm key={prefs?.updated_at ?? 'new'} personId={personId} prefs={prefs ?? null} />
        )}
      </CardContent>
    </Card>
  )
}
