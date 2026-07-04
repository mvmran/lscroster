import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PersonForm, type PersonFormValues } from '@/features/people/person-form'
import { formValuesToPerson } from '@/features/people/person-utils'
import { useCreatePerson } from '@/features/people/use-people'

export function CreatePersonPage() {
  const createPerson = useCreatePerson()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  async function onSubmit(values: PersonFormValues) {
    setServerError(null)
    try {
      const person = await createPerson.mutateAsync(formValuesToPerson(values))
      toast.success(`${person.first_name} added`)
      navigate(`/people/${person.id}`, { replace: true })
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'Failed to create person',
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Add person" backTo="/people" backLabel="People" />
      <Card>
        <CardHeader>
          <CardTitle>New person</CardTitle>
          <CardDescription>
            A person is just a directory record — they don't need a login. You
            can invite them to create an account later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PersonForm
            onSubmit={onSubmit}
            submitLabel="Add person"
            canEditEmail
            canEditRole
            canEditNotes
            serverError={serverError}
          />
        </CardContent>
      </Card>
    </div>
  )
}
