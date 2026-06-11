import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Church, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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
import { useAuth } from '@/features/auth/use-auth'
import { useChurchSettings } from '@/features/settings/use-church-settings'
import { supabase } from '@/lib/supabase'

const signInSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
  password: z.string().min(1, { error: 'Enter your password' }),
})

type SignInValues = z.infer<typeof signInSchema>

export function SignInPage() {
  const { session, loading } = useAuth()
  const settings = useChurchSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  if (loading || settings.isPending) return <FullPageLoader />
  if (settings.data === null) return <Navigate to="/setup" replace />
  if (session) {
    const from = (location.state as { from?: { pathname: string } } | null)
      ?.from?.pathname
    return <Navigate to={from ?? '/'} replace />
  }

  async function onSubmit(values: SignInValues) {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setServerError(
        error.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : error.message,
      )
      return
    }
    const from = (location.state as { from?: { pathname: string } } | null)
      ?.from?.pathname
    navigate(from ?? '/', { replace: true })
  }

  const { errors, isSubmitting } = form.formState

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Church className="mx-auto mb-2 size-8" />
          <CardTitle className="text-xl">
            {settings.data?.name ?? 'LSCRoster'}
          </CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
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
                <p className="text-destructive text-sm">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              {errors.password && (
                <p className="text-destructive text-sm">
                  {errors.password.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-destructive text-sm">{serverError}</p>
            )}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
