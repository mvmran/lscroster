import { useMutation } from '@tanstack/react-query'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { invokeFunction } from '@/lib/functions'

function ChurchSettingsCard() {
  const { data: settings, isPending } = useChurchSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Church</CardTitle>
        <CardDescription>
          Instance configuration created by the setup wizard. Editing comes in
          a later phase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending || !settings ? (
          <Skeleton className="h-16 w-full" />
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
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

function TestEmailCard() {
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
      <CardContent>
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
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { data: person } = useCurrentPerson()
  const canSendEmail = person?.role === 'admin' || person?.role === 'leader'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ChurchSettingsCard />
      {canSendEmail && <TestEmailCard />}
    </div>
  )
}
