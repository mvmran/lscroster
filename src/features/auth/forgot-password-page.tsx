import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Church, Loader2, MailCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
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
import { ChurchLogo } from '@/features/settings/church-logo'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { invokeFunction } from '@/lib/functions'

const schema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
})

type Values = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const settings = useChurchSettings()
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: Values) {
    // Always show the same neutral confirmation — never reveal whether the
    // address has an account, and don't surface server/config errors here.
    try {
      await invokeFunction('request-password-reset', { email: values.email })
    } catch {
      // Intentionally ignored (issue #39 — no account-enumeration signal).
    }
    setSubmitted(true)
  }

  const { errors, isSubmitting } = form.formState

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <ChurchLogo
            settings={settings.data}
            className="mx-auto mb-2 h-12 w-auto"
            fallback={<Church className="mx-auto mb-2 size-8" />}
          />
          <CardTitle className="text-xl">Forgot password</CardTitle>
          <CardDescription>
            {submitted
              ? 'Check your inbox'
              : 'Enter your email and we’ll send a reset link.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col gap-4">
              <div className="text-muted-foreground flex flex-col items-center gap-2 text-center text-sm">
                <MailCheck className="text-foreground size-8" />
                <p>
                  If an account exists for that email, we’ve sent a reset link.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link to="/signin">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...form.register('email')}
                />
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Send reset link
              </Button>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to="/signin">Back to sign in</Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
