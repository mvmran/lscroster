import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Loader2, Mail, Users as UsersIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/use-auth'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  useChurchSettings,
  useUpdateChurchSettings,
} from '@/features/settings/use-church-settings'
import { invokeFunction } from '@/lib/functions'

type ChurchSettings = NonNullable<ReturnType<typeof useChurchSettings>['data']>

function ChurchSettingsForm({ settings }: { settings: ChurchSettings }) {
  const updateSettings = useUpdateChurchSettings()
  const [name, setName] = useState(settings.name)
  const [address, setAddress] = useState(settings.address ?? '')

  const dirty =
    name.trim() !== settings.name || address.trim() !== (settings.address ?? '')

  function save() {
    updateSettings.mutate(
      {
        id: settings.id,
        values: { name: name.trim(), address: address.trim() || null },
      },
      {
        onSuccess: () => toast.success('Church details saved'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="church-name">Name</Label>
        <Input
          id="church-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="church-address">Address</Label>
        <Textarea
          id="church-address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 12 Example St, Sydney NSW 2000"
        />
      </div>
      <dl className="text-sm">
        <dt className="text-muted-foreground">Timezone</dt>
        <dd className="font-medium">{settings.timezone}</dd>
      </dl>
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={updateSettings.isPending || !name.trim()}
            onClick={save}
          >
            {updateSettings.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  )
}

function ChurchSettingsCard({ canEdit }: { canEdit: boolean }) {
  const { data: settings, isPending } = useChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Church</CardTitle>
        <CardDescription>
          {canEdit
            ? 'Your church name and address. The address appears on plan-publish emails.'
            : 'Instance configuration created by the setup wizard.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending || !settings ? (
          <Skeleton className="h-16 w-full" />
        ) : canEdit ? (
          <ChurchSettingsForm key={settings.updated_at} settings={settings} />
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{settings.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="font-medium">{settings.timezone}</dd>
            </div>
            {settings.address && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium whitespace-pre-line">
                  {settings.address}
                </dd>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

function TestEmailCard({ isAdmin }: { isAdmin: boolean }) {
  const { session } = useAuth()
  const email = session?.user.email

  const sendTest = useMutation({
    mutationFn: () =>
      invokeFunction<{ ok: boolean; id: string }>('send-email', {
        to: email,
        template: 'test',
      }),
    onSuccess: () => toast.success(`Test email sent to ${email}`),
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email delivery</CardTitle>
        <CardDescription>
          Sends a test email to your address ({email}) through the send-email
          Edge Function and Resend. Use this to verify email is configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          onClick={() => sendTest.mutate()}
          disabled={sendTest.isPending || !email}
          variant="outline"
        >
          {sendTest.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mail className="size-4" />
          )}
          Send test email
        </Button>
        {isAdmin && (
          <Button asChild variant="ghost">
            <Link to="/settings/email-log">View email log</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ServiceTypesLinkCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Service types</CardTitle>
        <CardDescription>
          The recurring gatherings you plan services for, e.g. “Sunday 10am”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/settings/service-types">
            <CalendarDays className="size-4" />
            Manage service types
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function UsersLinkCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; roles</CardTitle>
        <CardDescription>
          Change who is an admin, leader or member, and deactivate people.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/settings/users">
            <UsersIcon className="size-4" />
            Manage users
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { data: person } = useCurrentPerson()
  const isAdmin = person?.role === 'admin'
  const canSendEmail = isAdmin || person?.role === 'leader'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ChurchSettingsCard canEdit={isAdmin} />
      {isAdmin && <ServiceTypesLinkCard />}
      {isAdmin && <UsersLinkCard />}
      {canSendEmail && <TestEmailCard isAdmin={isAdmin} />}
    </div>
  )
}
