import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Church, Loader2, TriangleAlert } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { PASSWORD_HINT, passwordWithConfirm } from '@/features/auth/password-utils'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

const passwordSchema = passwordWithConfirm

type PasswordValues = z.infer<typeof passwordSchema>

interface InviteInfo {
  firstName: string
  email: string
  churchName: string
}

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const info = useQuery({
    queryKey: ['invite-info', token],
    enabled: !!token,
    retry: false,
    queryFn: () =>
      invokeFunction<InviteInfo>('accept-invitation', {
        action: 'info',
        token: token!,
      }),
  })

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  if (info.isPending) return <FullPageLoader />

  if (info.isError) {
    return (
      <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <TriangleAlert className="text-destructive mx-auto mb-2 size-8" />
            <CardTitle className="text-xl">Invitation problem</CardTitle>
            <CardDescription>{info.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/signin">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  async function onSubmit(values: PasswordValues) {
    setServerError(null)
    try {
      await invokeFunction<{ ok: boolean; email: string }>(
        'accept-invitation',
        { action: 'accept', token: token!, password: values.password },
      )
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'Something went wrong',
      )
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: info.data!.email,
      password: values.password,
    })
    navigate(signInError ? '/signin' : '/', { replace: true })
  }

  const { errors, isSubmitting } = form.formState

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Church className="mx-auto mb-2 size-8" />
          <CardTitle className="text-xl">
            Welcome, {info.data.firstName}!
          </CardTitle>
          <CardDescription>
            You've been invited to {info.data.churchName}. Set a password to
            finish creating your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" value={info.data.email} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              {errors.password ? (
                <p className="text-destructive text-sm">
                  {errors.password.message}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">{PASSWORD_HINT}</p>
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
                <p className="text-destructive text-sm">
                  {errors.confirm.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-destructive text-sm">{serverError}</p>
            )}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Create account &amp; sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
