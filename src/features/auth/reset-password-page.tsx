import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Church, Loader2, TriangleAlert } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { FullPageLoader } from '@/components/full-page-loader'
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
import { supabase } from '@/lib/supabase'

// Same rules as the invite page's password form (min 8 + confirm match).
const passwordSchema = z
  .object({
    password: z.string().min(8, { error: 'Password must be at least 8 characters' }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    error: 'Passwords do not match',
    path: ['confirm'],
  })

type PasswordValues = z.infer<typeof passwordSchema>

type Status = 'checking' | 'ready' | 'invalid'

export function ResetPasswordPage() {
  const settings = useChurchSettings()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [serverError, setServerError] = useState<string | null>(null)

  // The recovery link lands here with a token in the URL hash. Supabase JS
  // auto-detects it and fires PASSWORD_RECOVERY, establishing a temporary
  // session. If no valid token arrives shortly, treat the link as expired.
  useEffect(() => {
    let resolved = false
    const ready = () => {
      resolved = true
      setStatus('ready')
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        ready()
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) ready()
    })

    const timer = setTimeout(() => {
      if (!resolved) setStatus('invalid')
    }, 3000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
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
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              {errors.password && (
                <p className="text-destructive text-sm">{errors.password.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
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
