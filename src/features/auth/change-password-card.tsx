import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { PASSWORD_HINT, passwordField } from '@/features/auth/password-utils'
import { useAuth } from '@/features/auth/use-auth'
import { supabase } from '@/lib/supabase'

// Same rules as every other password form (issue #60), plus the current
// password and the usual confirmation.
const changePasswordSchema = z
  .object({
    current: z.string().min(1, { error: 'Enter your current password' }),
    password: passwordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    error: 'Passwords do not match',
    path: ['confirm'],
  })
  .refine((v) => v.password !== v.current, {
    error: 'Choose a password different from your current one',
    path: ['password'],
  })

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

const EMPTY: ChangePasswordValues = { current: '', password: '', confirm: '' }

/**
 * Let someone change their own password from their profile (issue #138).
 *
 * Supabase's `updateUser` does not ask for the old password, so we prove it
 * ourselves first by signing in with it. That re-authenticates the session,
 * which also satisfies Supabase's "secure password change" setting if an
 * instance has it switched on, and means a walked-away-from session cannot be
 * used to lock the owner out.
 */
export function ChangePasswordCard() {
  const { session } = useAuth()
  const email = session?.user.email
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  })

  async function onSubmit(values: ChangePasswordValues) {
    setServerError(null)
    if (!email) {
      setServerError('Your account has no email address to verify against.')
      return
    }

    const check = await supabase.auth.signInWithPassword({
      email,
      password: values.current,
    })
    if (check.error) {
      form.setError('current', {
        message:
          check.error.message === 'Invalid login credentials'
            ? 'That is not your current password.'
            : check.error.message,
      })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setServerError(error.message)
      return
    }

    form.reset(EMPTY)
    toast.success('Password changed')
  }

  const { errors, isSubmitting } = form.formState

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Change the password you use to sign in. {PASSWORD_HINT}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-w-sm flex-col gap-4"
          noValidate
        >
          {/* Helps password managers offer to update the saved entry. */}
          <input
            type="text"
            autoComplete="username"
            value={email ?? ''}
            readOnly
            hidden
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              {...form.register('current')}
            />
            {errors.current && (
              <p className="text-destructive text-sm">{errors.current.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              {...form.register('password')}
            />
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              {...form.register('confirm')}
            />
            {errors.confirm && (
              <p className="text-destructive text-sm">{errors.confirm.message}</p>
            )}
          </div>
          {serverError && <p className="text-destructive text-sm">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
