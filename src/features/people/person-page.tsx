import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Camera,
  KeyRound,
  Loader2,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import { FullPageLoader } from '@/components/full-page-loader'
import { STATUS_OUTLINE } from '@/lib/status'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { InviteControls } from '@/features/people/invite-controls'
import { formatPhone } from '@/features/people/phone-utils'
import { PersonAvatar } from '@/features/people/person-avatar'
import { PersonForm, type PersonFormValues } from '@/features/people/person-form'
import {
  accountStatus,
  formValuesToPerson,
  fullName,
  personToFormValues,
  ROLE_LABELS,
} from '@/features/people/person-utils'
import {
  useAccountAccess,
  useDeletePerson,
  usePeopleManagedBy,
  usePerson,
  useUpdatePerson,
} from '@/features/people/use-people'
import {
  usePhotoUrl,
  useRemovePhoto,
  useUploadPhoto,
} from '@/features/people/use-photos'
import { PersonEmailPrefsCard } from '@/features/people/person-email-prefs-card'
import { PersonScheduleCard } from '@/features/people/person-schedule-card'
import { PersonSchedulingCard } from '@/features/scheduling/person-scheduling-card'
import { PersonTeamsCard } from '@/features/scheduling/person-teams-card'
import { PersonTeamGrantsCard } from '@/features/scheduling/person-team-grants-card'
import { usePersonSchedule } from '@/features/scheduling/use-assignments'
import { todayISODate } from '@/features/services/service-utils'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const person = usePerson(id)
  const { data: me } = useCurrentPerson()
  const updatePerson = useUpdatePerson()
  const deletePerson = useDeletePerson()
  const accountAccess = useAccountAccess()
  const uploadPhoto = useUploadPhoto()
  const removePhoto = useRemovePhoto()
  const navigate = useNavigate()
  const managed = usePeopleManagedBy(id)
  // Future-dated, non-declined assignments — surfaced as a warning before an
  // admin archives or deletes someone, since neither removes those rosters and
  // they'd be left silently understaffed (and, for archive, unreadable to
  // members, see the matrix null-embed guard).
  const schedule = usePersonSchedule(id)
  const upcomingCount = useMemo(() => {
    const today = todayISODate()
    const planIds = new Set<string>()
    for (const r of schedule.data ?? []) {
      if (r.plans && r.plans.date >= today) planIds.add(r.plans.id)
    }
    return planIds.size
  }, [schedule.data])
  const upcomingLabel =
    upcomingCount === 1 ? '1 upcoming service' : `${upcomingCount} upcoming services`

  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // Holds the form values while the admin confirms removing an account's email
  // (issue #92), which revokes its sign-in and resets it to a fresh record.
  const [pendingEmailRemoval, setPendingEmailRemoval] =
    useState<PersonFormValues | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoUrl = usePhotoUrl(person.data?.photo_url)

  if (person.isPending) return <FullPageLoader />
  if (person.isError) return <FullPageError message={person.error.message} />
  if (!person.data) {
    return <FullPageError message="Person not found (or you don't have access)." />
  }

  const p = person.data
  const isAdmin = me?.role === 'admin'
  const isLeader = me?.role === 'leader'
  const isSelf = me?.id === p.id
  // A managing member (issue #89) gets self-level rights over the person they
  // manage: edit their profile/photo and respond to rosters on their behalf.
  const isManaging = !!me && p.managed_by_person_id === me.id
  const canEdit = isAdmin || isSelf || isManaging
  // Contact details (email/phone/birthday) are masked server-side by the
  // people_directory view (issue #119): they come back null unless this viewer
  // is allowed to see them (admin/leader, self, a manager, or a Team Leader of
  // a team the person is on). If any value is present, or this viewer is clearly
  // privileged, show the card; otherwise show a "private" note.
  const canSeeContact =
    isAdmin || isLeader || isSelf || isManaging || !!(p.email || p.phone || p.birthday)

  async function onEditSubmit(values: PersonFormValues) {
    // #92: removing the email of an account that already has a login revokes its
    // sign-in and resets it to a fresh, invitable record — confirm first.
    const removingEmail =
      isAdmin && !!p.email && !values.email.trim() && !!p.auth_user_id
    if (removingEmail) {
      setPendingEmailRemoval(values)
      return
    }
    await saveEdit(values)
  }

  async function saveEdit(values: PersonFormValues, opts?: { skipEmail?: boolean }) {
    setEditError(null)
    const update = formValuesToPerson(values)
    if (!isAdmin) {
      // The DB trigger rejects these for non-admins; don't even send them.
      delete update.email
      delete update.role
      delete update.notes
    } else if (isSelf) {
      // An admin can't change their own role (issue #44) — the selector is
      // locked, but drop it from the payload too so the DB guard never fires.
      delete update.role
    }
    // The account-access function already cleared the email; don't re-send it.
    if (opts?.skipEmail) delete update.email
    try {
      await updatePerson.mutateAsync({ id: p.id, values: update })
      toast.success('Saved')
      setEditOpen(false)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Save failed')
    }
  }

  async function confirmEmailRemoval() {
    const values = pendingEmailRemoval
    setPendingEmailRemoval(null)
    if (!values) return
    try {
      // Clears the email, revokes sign-in and notifies the old address, then
      // saves any other field edits from the same form (without the email).
      await accountAccess.mutateAsync({ personId: p.id, action: 'clear-email' })
      await saveEdit(values, { skipEmail: true })
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not remove email')
      setEditOpen(true)
    }
  }

  async function onPhotoChosen(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Photo must be under 5 MB')
      return
    }
    try {
      await uploadPhoto.mutateAsync({ person: p, file })
      toast.success('Photo updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  async function onPhotoRemove() {
    try {
      await removePhoto.mutateAsync({ person: p })
      toast.success('Photo removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed')
    }
  }

  async function setStatus(status: 'active' | 'inactive') {
    try {
      // Via the account-access function so the person is emailed about the
      // sign-in change (issue #91), which the browser can't send.
      await accountAccess.mutateAsync({
        personId: p.id,
        action: status === 'active' ? 'reactivate' : 'archive',
      })
      toast.success(status === 'active' ? 'Reactivated' : 'Archived')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed')
    }
  }

  async function onDelete() {
    try {
      await deletePerson.mutateAsync(p.id)
      toast.success(`${fullName(p)} deleted`)
      navigate('/people', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    }
  }

  // The Schedules card (issue #52) lists a person's services; show it to anyone
  // who can read their assignments — admins/leaders, the person themselves, or
  // a member who manages them (issue #89).
  const showSchedule = isAdmin || isLeader || isSelf || isManaging
  // Email preferences (issue #87) are visible/editable by the same set.
  const showEmailPrefs = isAdmin || isLeader || isSelf || isManaging
  // Members this person manages, named in the Account & access card (issue #91).
  // Any managed link (accepted or pending) blocks Archive/Delete until detached.
  const managedPeople = managed.data ?? []
  const managedNames = managedPeople.map((m) => fullName(m))
  const managesAnyone = managedPeople.length > 0

  return (
    <div className="mx-auto flex w-full flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate('/people')
          }
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <PersonAvatar
            person={p}
            photoUrl={photoUrl.data}
            className="size-20 text-xl"
          />
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhotoChosen(e.target.files?.[0])}
              />
              <Button
                size="icon"
                variant="secondary"
                className="absolute -right-1 -bottom-1 size-7 rounded-full border shadow-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadPhoto.isPending}
                aria-label="Change photo"
              >
                {uploadPhoto.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Camera className="size-3.5" />
                )}
              </Button>
              {p.photo_url && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -top-1 -right-1 size-6 rounded-full border shadow-sm"
                  onClick={onPhotoRemove}
                  disabled={removePhoto.isPending || uploadPhoto.isPending}
                  aria-label="Remove photo"
                >
                  {removePhoto.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <X className="size-3" />
                  )}
                </Button>
              )}
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight">{fullName(p)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={p.role === 'member' ? 'secondary' : 'default'}>
              {ROLE_LABELS[p.role]}
            </Badge>
            {p.status === 'inactive' && <Badge variant="outline">Inactive</Badge>}
            {accountStatus(p) === 'pending' && (
              <Badge variant="outline" className={STATUS_OUTLINE.warning}>
                Pending invite
              </Badge>
            )}
            {p.auth_user_id &&
              (p.status === 'inactive' ? (
                <Badge variant="outline" className="text-muted-foreground">
                  <KeyRound className="size-3" />
                  Sign-in disabled
                </Badge>
              ) : (
                <Badge variant="outline">
                  <KeyRound className="size-3" />
                  Can sign in
                </Badge>
              ))}
          </div>
        </div>
        {canEdit && (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Pencil className="size-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit {p.first_name}</DialogTitle>
              </DialogHeader>
              <PersonForm
                defaultValues={personToFormValues(p)}
                onSubmit={onEditSubmit}
                submitLabel="Save changes"
                canEditEmail={isAdmin}
                canEditRole={isAdmin}
                canEditNotes={isAdmin}
                roleLocked={isAdmin && isSelf}
                serverError={editError}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div
        className={
          showSchedule
            ? 'grid grid-cols-1 gap-4 lg:grid-cols-[45fr_55fr] lg:items-start'
            : 'flex flex-col gap-4'
        }
      >
        {showSchedule && (
          <PersonScheduleCard personId={p.id} canSeeTeam={isAdmin || isLeader} />
        )}

        {/* Everything else stacks in the right column on large screens. */}
        <div className="flex flex-col gap-4">
          {/* Contact details */}
          <Card>
            <CardHeader>
              <CardTitle>Contact details</CardTitle>
            </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            {canSeeContact ? (
              <>
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-medium break-all">{p.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">
                    {p.phone ? formatPhone(p.phone) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Birthday</dt>
                  <dd className="font-medium">
                    {p.birthday ? format(new Date(p.birthday), 'd MMMM yyyy') : '—'}
                  </dd>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground sm:col-span-2">
                Email, phone and birthday are private.
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Added</dt>
              <dd className="font-medium">
                {format(new Date(p.created_at), 'd MMM yyyy')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <PersonTeamsCard personId={p.id} canManage={isAdmin || isLeader} />

      {/* Per-team access grants (Team Leader / Team Viewer). Governance — admins
          + global leaders — can grant several teams at once; the person
          themselves and anyone managing them (issue #89) see the grants
          read-only. */}
      {(isAdmin || isLeader || isSelf || isManaging) && (
        <>
          <PersonTeamGrantsCard
            personId={p.id}
            kind="leader"
            canManage={isAdmin || isLeader}
          />
          <PersonTeamGrantsCard
            personId={p.id}
            kind="viewer"
            canManage={isAdmin || isLeader}
          />
        </>
      )}

      {(isAdmin || isLeader) && <PersonSchedulingCard personId={p.id} />}

      {/* Email preferences (issue #87) — after Scheduling rules. */}
      {showEmailPrefs && <PersonEmailPrefsCard personId={p.id} />}

      {/* Notes — admins and leaders only */}
      {(isAdmin || isLeader) && p.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Visible to admins and leaders.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {p.notes}
          </CardContent>
        </Card>
      )}

      {/* Account & access — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Account &amp; access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {p.auth_user_id ? (
              <p className="text-muted-foreground text-sm">
                {p.status === 'inactive'
                  ? `${p.first_name} is archived — sign-in is disabled until reactivated.`
                  : `${p.first_name} has sign-in access.`}
                {managesAnyone && (
                  <>
                    {' '}
                    {p.first_name} manages {formatList(managedNames)}. Revoke
                    that before Archive or Delete.
                  </>
                )}
              </p>
            ) : (
              <InviteControls person={p} />
            )}

            {!isSelf && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {p.status === 'active' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accountAccess.isPending || managesAnyone}
                      >
                        <Archive className="size-4" />
                        Archive
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Archive {fullName(p)}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          They'll be hidden from the directory and can't be
                          scheduled, and their sign-in access is disabled.
                          {p.auth_user_id
                            ? ` ${p.first_name} will be emailed that their sign-in access has been revoked.`
                            : ''}{' '}
                          Their history is kept and you can reactivate them
                          anytime.
                        </AlertDialogDescription>
                        {upcomingCount > 0 && (
                          <div className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            {p.first_name} is still rostered on {upcomingLabel}.
                            Archiving won't remove those assignments — review and
                            re-roster them first, or those slots will be left
                            unfilled.
                          </div>
                        )}
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setStatus('inactive')}>
                          Archive
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accountAccess.isPending}
                      >
                        <ArchiveRestore className="size-4" />
                        Reactivate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Reactivate {fullName(p)}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          They'll reappear in the directory and can be scheduled
                          again
                          {p.auth_user_id
                            ? `, and their sign-in access is restored. ${p.first_name} will be emailed that their access has been reinstated.`
                            : '.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setStatus('active')}>
                          Reactivate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={managesAnyone}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {fullName(p)}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes their record and any sign-in
                        access. Usually archiving is better — it keeps history
                        but hides them from the directory.
                      </AlertDialogDescription>
                      {upcomingCount > 0 && (
                        <div className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                          {p.first_name} is still rostered on {upcomingLabel}.
                          Deleting removes those assignments and leaves the slots
                          unfilled — re-roster them first.
                        </div>
                      )}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-destructive text-white hover:bg-destructive/90"
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </div>
      </div>

      {/* #92 — removing an account's email revokes its sign-in. */}
      <AlertDialog
        open={!!pendingEmailRemoval}
        onOpenChange={(open) => !open && setPendingEmailRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {p.first_name}'s email?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing the email revokes {p.first_name}'s sign-in access — their
              account becomes a fresh, pending record. They'll be emailed that
              their access has been revoked, and you'll need to add an email (or
              assign a managing member) and send a new invitation for them to sign
              in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEmailRemoval}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remove email &amp; revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Joins names as "A", "A and B", or "A, B and C". */
function formatList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
