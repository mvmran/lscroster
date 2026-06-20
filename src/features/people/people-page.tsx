import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, Upload, Users } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  BULK_ACTION_LABELS,
  bulkConfirmQuestion,
  partitionBulk,
  type BulkAction,
} from '@/features/people/bulk-utils'
import { PersonAvatar } from '@/features/people/person-avatar'
import { formatPhone } from '@/features/people/phone-utils'
import { useSendInvite } from '@/features/people/use-invitations'
import {
  accountStatus,
  fullName,
  ROLE_LABELS,
  ROLES,
} from '@/features/people/person-utils'
import { usePeople, useUpdatePerson, type Person } from '@/features/people/use-people'
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
  const location = useLocation()

  // When returning from a person's page (the "← People" back link passes their
  // id as navigation state), scroll that row into view and briefly highlight it
  // so it's easy to find again in a long list. We toggle classes on the element
  // directly rather than via React state to keep the highlight a one-shot effect.
  const focusId = (location.state as { focusId?: string } | null)?.focusId
  useEffect(() => {
    if (!focusId || isPending) return
    // The list renders twice (mobile cards + desktop table), so there are two
    // elements per person — pick whichever one is actually visible (the hidden
    // variant has no offsetParent and scrollIntoView would be a no-op on it).
    const candidates = document.querySelectorAll<HTMLElement>(
      `[data-person-row="${focusId}"]`,
    )
    const el =
      [...candidates].find((c) => c.offsetParent !== null) ?? candidates[0]
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // A soft background tint (no hard border) that fades out via transition-colors.
    const flashClasses = ['bg-accent']
    el.classList.add(...flashClasses)
    // Drop the navigation state so a later re-render doesn't re-trigger this.
    navigate(location.pathname, { replace: true, state: null })
    const timer = setTimeout(() => el.classList.remove(...flashClasses), 2000)
    return () => clearTimeout(timer)
  }, [focusId, isPending, navigate, location.pathname])

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

  // --- bulk selection (issue #77, admin-only) --------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction>('invite')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const sendInvite = useSendInvite()
  const updatePerson = useUpdatePerson()

  // Selection is scoped to the rows currently visible, so a filter change can't
  // act on people you can no longer see.
  const selectedPeople = useMemo(
    () => filtered.filter((p) => selectedIds.has(p.id)),
    [filtered, selectedIds],
  )
  const allVisibleSelected = filtered.length > 0 && selectedPeople.length === filtered.length

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function toggleAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const p of filtered) {
        if (checked) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  const { eligible, skipped } = partitionBulk(bulkAction, selectedPeople, me?.id)

  function onGo() {
    if (eligible.length === 0) {
      toast.info(`Nothing to do — none of the selected people can be ${
        bulkAction === 'invite' ? 'invited' : 'archived'
      }.`)
      return
    }
    setConfirmOpen(true)
  }

  async function runBulk() {
    setConfirmOpen(false)
    setRunning(true)
    let ok = 0
    let failed = 0
    for (const person of eligible) {
      try {
        if (bulkAction === 'invite') {
          await sendInvite.mutateAsync(person.id)
        } else {
          await updatePerson.mutateAsync({ id: person.id, values: { status: 'inactive' } })
        }
        ok++
      } catch {
        failed++
      }
    }
    setRunning(false)
    clearSelection()
    const verb = bulkAction === 'invite' ? 'invited' : 'archived'
    if (ok > 0) toast.success(`${ok} ${verb}`)
    if (failed > 0) toast.error(`${failed} failed`)
    if (skipped.length > 0) toast.warning(`${skipped.length} skipped`)
  }

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

      {/* Bulk-action toolbar (issue #77) — admin-only, shown once rows are picked. */}
      {isAdmin && selectedPeople.length > 0 && (
        <div className="bg-accent/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <span className="text-sm font-medium">
            {selectedPeople.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Select value={bulkAction} onValueChange={(v) => setBulkAction(v as BulkAction)}>
              <SelectTrigger className="w-44" aria-label="Bulk action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invite">{BULK_ACTION_LABELS.invite}</SelectItem>
                <SelectItem value="archive">{BULK_ACTION_LABELS.archive}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={onGo} disabled={running}>
              {running && <Loader2 className="size-4 animate-spin" />}
              Go
            </Button>
            <Button variant="ghost" onClick={clearSelection} disabled={running}>
              Clear
            </Button>
          </div>
        </div>
      )}

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
                <Card
                  data-person-row={person.id}
                  className="py-3 transition-colors active:bg-accent"
                >
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
                  <TableHead>
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(c) => toggleAllVisible(c === true)}
                          aria-label="Select all people"
                        />
                      )}
                      Name
                    </div>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((person) => {
                  const selected = selectedIds.has(person.id)
                  return (
                  <TableRow
                    key={person.id}
                    data-person-row={person.id}
                    data-state={selected ? 'selected' : undefined}
                    className="cursor-pointer transition-colors"
                    onClick={() => navigate(`/people/${person.id}`)}
                  >
                    <TableCell>
                      <div className="group/sel flex items-center gap-3">
                        {/* Hovering the avatar (or selecting) reveals a checkbox (#77). */}
                        <div className="relative size-9 shrink-0">
                          <PersonAvatar
                            person={person}
                            photoUrl={
                              person.photo_url ? photoUrls?.[person.photo_url] : null
                            }
                            className={
                              isAdmin
                                ? `transition-opacity ${selected ? 'opacity-0' : 'group-hover/sel:opacity-0'}`
                                : undefined
                            }
                          />
                          {isAdmin && (
                            <span
                              className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                                selected ? 'opacity-100' : 'opacity-0 group-hover/sel:opacity-100'
                              }`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(c) => toggleOne(person.id, c === true)}
                                aria-label={`Select ${fullName(person)}`}
                              />
                            </span>
                          )}
                        </div>
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
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* Bulk confirm (issue #77). */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirmQuestion(bulkAction, eligible.length)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'invite'
                ? 'Each person will be emailed a link to set their password.'
                : 'Archived people are hidden from the directory and can no longer sign in. You can reactivate them later.'}
              {skipped.length > 0 &&
                ` ${skipped.length} of the selected ${
                  skipped.length === 1 ? 'person' : 'people'
                } will be skipped.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBulk}>
              {BULK_ACTION_LABELS[bulkAction]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
