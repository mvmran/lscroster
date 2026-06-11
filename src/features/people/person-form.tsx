import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ROLE_LABELS, ROLES } from '@/features/people/person-utils'

const personFormSchema = z.object({
  firstName: z.string().trim().min(1, { error: 'First name is required' }),
  lastName: z.string().trim().min(1, { error: 'Last name is required' }),
  email: z.union([z.literal(''), z.email({ error: 'Enter a valid email' })]),
  phone: z.string().trim(),
  birthday: z.string(), // yyyy-mm-dd from <input type="date">, or ''
  notes: z.string(),
  role: z.enum(ROLES),
})

export type PersonFormValues = z.infer<typeof personFormSchema>

interface PersonFormProps {
  defaultValues?: PersonFormValues
  onSubmit: (values: PersonFormValues) => Promise<void>
  submitLabel: string
  /** Email changes are admin-only (the DB trigger enforces it too). */
  canEditEmail: boolean
  /** Role and notes are admin-only fields. */
  canEditRole: boolean
  canEditNotes: boolean
  serverError?: string | null
}

const emptyValues: PersonFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthday: '',
  notes: '',
  role: 'member',
}

export function PersonForm({
  defaultValues,
  onSubmit,
  submitLabel,
  canEditEmail,
  canEditRole,
  canEditNotes,
  serverError,
}: PersonFormProps) {
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: defaultValues ?? emptyValues,
  })
  const { errors, isSubmitting } = form.formState

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" {...form.register('firstName')} />
          {errors.firstName && (
            <p className="text-destructive text-sm">{errors.firstName.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" {...form.register('lastName')} />
          {errors.lastName && (
            <p className="text-destructive text-sm">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          disabled={!canEditEmail}
          {...form.register('email')}
        />
        {!canEditEmail && (
          <p className="text-muted-foreground text-xs">
            Only admins can change email addresses.
          </p>
        )}
        {errors.email && (
          <p className="text-destructive text-sm">{errors.email.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" {...form.register('phone')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthday">Birthday</Label>
          <Input id="birthday" type="date" {...form.register('birthday')} />
        </div>
      </div>

      {canEditRole && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="role" className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      {canEditNotes && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} {...form.register('notes')} />
          <p className="text-muted-foreground text-xs">
            Visible to admins and leaders.
          </p>
        </div>
      )}

      {serverError && <p className="text-destructive text-sm">{serverError}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
