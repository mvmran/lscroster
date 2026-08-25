import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Church, Loader2, TriangleAlert, Users } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_HINT, passwordWithConfirm } from '@/features/auth/password-utils'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

const passwordSchema = passwordWithConfirm

type PasswordValues = z.infer<typeof passwordSchema>

/**
 * `managed` invites are confirmations for a managing member looking after a
 * person without their own login (issue #89) — no password is set. A normal
 * invite creates the person's own account.
 */
type InviteInfo =
  | { managed: false; firstName: string; email: string; churchName: string }
  | { managed: true; churchName: string; managerName: string; managedName: string }

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
    const data = info.data
    if (!data || data.managed) return
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
      email: data.email,
      password: values.password,
    })
    navigate(signInError ? '/signin' : '/', { replace: true })
  }

  const { errors, isSubmitting } = form.formState

  // Managed-account confirmation (issue #89): the manager just confirms — no
  // password, since they sign in with their own existing account.
  if (info.data.managed) {
    return <ManagedConfirm token={token!} info={info.data} />
  }

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
              <PasswordInput
                id="password"
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
              <PasswordInput
                id="confirm"
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

function ManagedConfirm({
  token,
  info,
}: {
  token: string
  info: { churchName: string; managerName: string; managedName: string }
}) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function confirm() {
    setServerError(null)
    setSubmitting(true)
    try {
      await invokeFunction<{ ok: boolean; managed: boolean }>(
        'accept-invitation',
        { action: 'accept', token },
      )
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Something went wrong')
      setSubmitting(false)
      return
    }
    // The manager signs in with their own account; send them there.
    navigate('/', { replace: true })
  }

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Users className="mx-auto mb-2 size-8" />
          <CardTitle className="text-xl">Manage {info.managedName}</CardTitle>
          <CardDescription>
            {info.churchName} has asked you to look after {info.managedName}'s
            roster. Confirm to view and respond to their scheduling requests from
            your own account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-xs">
            Please respect {info.managedName}'s privacy — only use this access on
            their behalf.
          </p>
          {serverError && <p className="text-destructive text-sm">{serverError}</p>}
          <Button onClick={confirm} disabled={submitting} className="w-full">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Confirm &amp; continue
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/">Go to LSCroster</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
