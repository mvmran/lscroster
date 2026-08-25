import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Church, Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PASSWORD_HINT, passwordField } from '@/features/auth/password-utils'
import {
  churchSettingsQueryKey,
  useChurchSettings,
} from '@/features/settings/use-church-settings'
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from '@/lib/constants'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

const setupSchema = z.object({
  churchName: z.string().trim().min(1, { error: 'Enter your church name' }),
  timezone: z.string().min(1, { error: 'Choose a timezone' }),
  firstName: z.string().trim().min(1, { error: 'Enter your first name' }),
  lastName: z.string().trim().min(1, { error: 'Enter your last name' }),
  email: z.email({ error: 'Enter a valid email address' }),
  password: passwordField,
})

type SetupValues = z.infer<typeof setupSchema>

export function SetupPage() {
  const settings = useChurchSettings()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      churchName: '',
      timezone: DEFAULT_TIMEZONE,
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  })

  if (settings.isPending) return <FullPageLoader />
  // Already configured — setup must not run twice.
  if (settings.data) return <Navigate to="/signin" replace />

  async function onSubmit(values: SetupValues) {
    setServerError(null)
    try {
      await invokeFunction('setup', values)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Setup failed')
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    await queryClient.invalidateQueries({ queryKey: churchSettingsQueryKey })
    if (signInError) {
      // Account was created; let them sign in manually.
      navigate('/signin', { replace: true })
      return
    }
    navigate('/', { replace: true })
  }

  const { errors, isSubmitting } = form.formState

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <Church className="mx-auto mb-2 size-8" />
          <CardTitle className="text-xl">Welcome to LSCroster</CardTitle>
          <CardDescription>
            Set up your church and create the first admin account. This only
            happens once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <h2 className="text-sm font-semibold">Your church</h2>
            <div className="flex flex-col gap-2">
              <Label htmlFor="churchName">Church name</Label>
              <Input
                id="churchName"
                placeholder="Your church's name"
                {...form.register('churchName')}
              />
              {errors.churchName && (
                <p className="text-destructive text-sm">
                  {errors.churchName.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="timezone" className="w-full">
                      <SelectValue placeholder="Choose a timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.timezone && (
                <p className="text-destructive text-sm">
                  {errors.timezone.message}
                </p>
              )}
            </div>

            <Separator className="my-2" />
            <h2 className="text-sm font-semibold">Your admin account</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...form.register('firstName')} />
                {errors.firstName && (
                  <p className="text-destructive text-sm">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...form.register('lastName')} />
                {errors.lastName && (
                  <p className="text-destructive text-sm">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
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

            {serverError && (
              <p className="text-destructive text-sm">{serverError}</p>
            )}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Create church &amp; admin account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
