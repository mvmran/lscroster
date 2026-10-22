import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Church, Loader2, TriangleAlert } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { FullPageLoader } from '@/components/full-page-loader'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { PASSWORD_HINT, passwordWithConfirm } from '@/features/auth/password-utils'
import { isRecentRecovery } from '@/features/auth/recovery-session'
import { ChurchLogo } from '@/features/settings/church-logo'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { supabase } from '@/lib/supabase'

// Same rules as every other password form (issue #60).
const passwordSchema = passwordWithConfirm

type PasswordValues = z.infer<typeof passwordSchema>

type Status = 'checking' | 'ready' | 'invalid'

export function ResetPasswordPage() {
  const settings = useChurchSettings()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [serverError, setServerError] = useState<string | null>(null)

  // The recovery link lands here with a token in the URL hash, which Supabase JS
  // turns into a session before INITIAL_SESSION fires (PASSWORD_RECOVERY can
  // follow it, with the same session). Only a session the link opened may set a
  // password here: anyone merely signed in would otherwise skip Change
  // password's current-password check. No timer — a slow phone still gets there.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') {
        setStatus(isRecentRecovery(session?.access_token) ? 'ready' : 'invalid')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  async function onSubmit(values: PasswordValues) {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setServerError(error.message)
      return
    }
    navigate('/', { replace: true })
  }

  if (status === 'checking') return <FullPageLoader />

  if (status === 'invalid') {
    return (
      <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <TriangleAlert className="text-destructive mx-auto mb-2 size-8" />
            <CardTitle className="text-xl">Reset link problem</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Request a new
              one to try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/signin">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
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
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              {errors.password ? (
                <p className="text-destructive text-sm">{errors.password.message}</p>
              ) : (
                <p className="text-muted-foreground text-xs">{PASSWORD_HINT}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                {...form.register('confirm')}
              />
              {errors.confirm && (
                <p className="text-destructive text-sm">{errors.confirm.message}</p>
              )}
            </div>
            {serverError && <p className="text-destructive text-sm">{serverError}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Update password &amp; sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
