import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  useChurchSettings,
  useUpdateChurchSettings,
} from '@/features/settings/use-church-settings'

type SwitchKey = 'allow_person_delete' | 'allow_song_delete'

const SWITCHES: { key: SwitchKey; label: string; description: string }[] = [
  {
    key: 'allow_person_delete',
    label: 'Allow deleting people',
    description:
      'Off: nobody can delete a person, including admins. Archive them instead — it keeps their history.',
  },
  {
    key: 'allow_song_delete',
    label: 'Allow deleting songs',
    description:
      'Off: nobody can delete a song. Archive it instead — it keeps the song’s plan history and lyrics.',
  },
]

/**
 * Settings → Deletion safety (admins). Two church-wide switches that turn hard
 * deletes off. The database enforces them (RLS, and the delete-person Edge
 * Function), so hiding the button is not the only thing standing in the way.
 */
export function DeleteSafetyCard() {
  const { data: settings } = useChurchSettings()
  const update = useUpdateChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="text-muted-foreground size-4" />
          Deletion safety
        </CardTitle>
        <CardDescription>
          Deleting can’t be undone. Turn it off to leave archiving as the only way
          to remove someone or something from view.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {SWITCHES.map((s) => (
          <div key={s.key} className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`switch-${s.key}`} className="text-sm font-medium">
                {s.label}
              </label>
              <p className="text-muted-foreground text-xs">{s.description}</p>
            </div>
            <Switch
              id={`switch-${s.key}`}
              checked={settings?.[s.key] ?? true}
              disabled={!settings || update.isPending}
              onCheckedChange={(checked) => {
                if (!settings) return
                update.mutate(
                  { id: settings.id, values: { [s.key]: checked } },
                  {
                    onSuccess: () =>
                      toast.success(`${s.label.replace('Allow d', 'D')} ${checked ? 'allowed' : 'turned off'}`),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }}
              title={s.label}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
