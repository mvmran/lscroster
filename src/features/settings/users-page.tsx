import { KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { PersonAvatar } from '@/features/people/person-avatar'
import { fullName, ROLE_LABELS, ROLES } from '@/features/people/person-utils'
import {
  usePeople,
  useUpdatePerson,
  type Person,
} from '@/features/people/use-people'
import type { Enums } from '@/types/database'

function UserRow({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const updatePerson = useUpdatePerson()

  async function setRole(role: Enums<'app_role'>) {
    try {
      await updatePerson.mutateAsync({ id: person.id, values: { role } })
      toast.success(`${person.first_name} is now ${ROLE_LABELS[role].toLowerCase()}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed')
    }
  }

  async function setActive(active: boolean) {
    try {
      await updatePerson.mutateAsync({
        id: person.id,
        values: { status: active ? 'active' : 'inactive' },
      })
      toast.success(
        active ? `${person.first_name} reactivated` : `${person.first_name} deactivated`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <Link
        to={`/people/${person.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <PersonAvatar person={person} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{fullName(person)}</span>
            {person.auth_user_id && (
              <KeyRound className="text-muted-foreground size-3.5 shrink-0" />
            )}
            {isSelf && <Badge variant="outline">You</Badge>}
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {person.email ?? 'No email'}
          </p>
        </div>
      </Link>
      <div className="flex items-center gap-3">
        <Select
          value={person.role}
          onValueChange={(v) => setRole(v as Enums<'app_role'>)}
          disabled={isSelf || updatePerson.isPending}
        >
          <SelectTrigger
            className="w-28"
            size="sm"
            aria-label={`Role for ${fullName(person)}`}
          >
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
        <Switch
          checked={person.status === 'active'}
          onCheckedChange={setActive}
          disabled={isSelf || updatePerson.isPending}
          aria-label={`Active status for ${fullName(person)}`}
        />
      </div>
    </div>
  )
}

export function UsersPage() {
  const { data: people, isPending, isError, error } = usePeople()
  const { data: me } = useCurrentPerson()

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
      <Card>
        <CardHeader>
          <CardTitle>Everyone in the directory</CardTitle>
          <CardDescription>
            Change roles and deactivate people. The key icon marks people with
            sign-in access. You can't change your own role or status — ask
            another admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            (people ?? []).map((person) => (
              <UserRow
                key={person.id}
                person={person}
                isSelf={me?.id === person.id}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
