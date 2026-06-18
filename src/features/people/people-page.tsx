import { useMemo, useState } from 'react'
import { Plus, Search, Upload, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { FullPageError } from '@/components/full-page-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { PersonAvatar } from '@/features/people/person-avatar'
import { formatPhone } from '@/features/people/phone-utils'
import {
  accountStatus,
  fullName,
  ROLE_LABELS,
  ROLES,
} from '@/features/people/person-utils'
import { usePeople, type Person } from '@/features/people/use-people'
import { usePhotoUrls } from '@/features/people/use-photos'

type SortOrder = 'name-asc' | 'name-desc' | 'newest'

function matchesSearch(person: Person, term: string) {
  const haystack =
    `${person.first_name} ${person.last_name} ${person.email ?? ''}`.toLowerCase()
  return haystack.includes(term)
}

// Status filter (issue #43). "active" stays "not archived" (so freshly imported
// people who still need an invite remain visible by default); "pending" narrows
// to exactly those without sign-in access yet; "inactive" is archived.
function matchesStatus(person: Person, filter: string) {
  switch (filter) {
    case 'active':
      return person.status === 'active'
    case 'pending':
      return accountStatus(person) === 'pending'
    case 'inactive':
      return person.status === 'inactive'
    default:
      return true
  }
}

/** Status pill for the People list (issue #43). Pending = no login yet. */
function StatusBadge({ person }: { person: Person }) {
  const status = accountStatus(person)
  if (status === 'active') {
    return <span className="text-muted-foreground">Active</span>
  }
  if (status === 'pending') {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 text-amber-700 dark:border-amber-700/60 dark:text-amber-400"
      >
        Pending
      </Badge>
    )
  }
  return <Badge variant="outline">Inactive</Badge>
}

export function PeoplePage() {
  const { data: people, isPending, isError, error } = usePeople()
  const { data: me } = useCurrentPerson()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [sort, setSort] = useState<SortOrder>('name-asc')

  const isAdmin = me?.role === 'admin'
  const canSeeInactive = me?.role === 'admin' || me?.role === 'leader'

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const result = (people ?? []).filter(
      (p) =>
        (term === '' || matchesSearch(p, term)) &&
        (roleFilter === 'all' || p.role === roleFilter) &&
        matchesStatus(p, statusFilter),
    )
    result.sort((a, b) => {
      if (sort === 'newest') return b.created_at.localeCompare(a.created_at)
      const cmp = fullName(a).localeCompare(fullName(b))
      return sort === 'name-asc' ? cmp : -cmp
    })
    return result
  }, [people, search, roleFilter, statusFilter, sort])

  const photoPaths = useMemo(
    () => filtered.map((p) => p.photo_url).filter((p): p is string => !!p),
    [filtered],
  )
  const { data: photoUrls } = usePhotoUrls(photoPaths)

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          People
          {people && (
            <span className="text-muted-foreground ml-2 text-base font-normal">
              {filtered.length}
            </span>
          )}
        </h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/people/import">
                <Upload className="size-4" />
                <span className="hidden sm:inline">Import CSV</span>
                <span className="sm:hidden">Import</span>
              </Link>
            </Button>
            <Button asChild>
              <Link to="/people/new">
                <Plus className="size-4" />
                Add person
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
            aria-label="Search people"
          />
        </div>
        <div className="flex gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="flex-1 sm:w-32" aria-label="Filter by role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canSeeInactive && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1 sm:w-32" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={sort} onValueChange={(v) => setSort(v as SortOrder)}>
            <SelectTrigger className="flex-1 sm:w-36" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <Users className="size-8" />
            {people?.length === 0
              ? 'No people yet. Add your first person or import a CSV.'
              : 'No people match your search.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((person) => (
              <Link key={person.id} to={`/people/${person.id}`}>
                <Card className="py-3 transition-colors active:bg-accent">
                  <CardContent className="flex items-center gap-3 px-4">
                    <PersonAvatar
                      person={person}
                      photoUrl={person.photo_url ? photoUrls?.[person.photo_url] : null}
                      className="size-10"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {fullName(person)}
                        </span>
                        {accountStatus(person) !== 'active' && (
                          <StatusBadge person={person} />
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-sm">
                        {person.email ??
                          (person.phone ? formatPhone(person.phone) : null) ??
                          '—'}
                      </p>
                    </div>
                    <Badge
                      variant={person.role === 'member' ? 'secondary' : 'default'}
                    >
                      {ROLE_LABELS[person.role]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((person) => (
                  <TableRow
                    key={person.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/people/${person.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PersonAvatar
                          person={person}
                          photoUrl={
                            person.photo_url ? photoUrls?.[person.photo_url] : null
                          }
                        />
                        <span className="font-medium">{fullName(person)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.email ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.phone ? formatPhone(person.phone) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={person.role === 'member' ? 'secondary' : 'default'}
                      >
                        {ROLE_LABELS[person.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge person={person} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
