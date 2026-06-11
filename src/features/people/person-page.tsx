import { useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  Archive,
  ArchiveRestore,
  Camera,
  KeyRound,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
import { FullPageLoader } from '@/components/full-page-loader'
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
import { PersonAvatar } from '@/features/people/person-avatar'
import { PersonForm, type PersonFormValues } from '@/features/people/person-form'
import {
  formValuesToPerson,
  fullName,
  personToFormValues,
  ROLE_LABELS,
} from '@/features/people/person-utils'
import {
  useDeletePerson,
  usePerson,
  useUpdatePerson,
} from '@/features/people/use-people'
import { usePhotoUrl, useUploadPhoto } from '@/features/people/use-photos'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const person = usePerson(id)
  const { data: me } = useCurrentPerson()
  const updatePerson = useUpdatePerson()
  const deletePerson = useDeletePerson()
  const uploadPhoto = useUploadPhoto()
  const navigate = useNavigate()

  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
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
  const canEdit = isAdmin || isSelf

  async function onEditSubmit(values: PersonFormValues) {
    setEditError(null)
    const update = formValuesToPerson(values)
    if (!isAdmin) {
      // The DB trigger rejects these for non-admins; don't even send them.
      delete update.email
      delete update.role
      delete update.notes
    }
    try {
      await updatePerson.mutateAsync({ id: p.id, values: update })
      toast.success('Saved')
      setEditOpen(false)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Save failed')
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

  async function setStatus(status: 'active' | 'inactive') {
    try {
      await updatePerson.mutateAsync({ id: p.id, values: { status } })
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
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
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{fullName(p)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={p.role === 'member' ? 'secondary' : 'default'}>
              {ROLE_LABELS[p.role]}
            </Badge>
            {p.status === 'inactive' && <Badge variant="outline">Inactive</Badge>}
            {p.auth_user_id && (
              <Badge variant="outline">
                <KeyRound className="size-3" />
                Can sign in
              </Badge>
            )}
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
                serverError={editError}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Contact details */}
      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium break-all">{p.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="font-medium">{p.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Birthday</dt>
              <dd className="font-medium">
                {p.birthday ? format(new Date(p.birthday), 'd MMMM yyyy') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Added</dt>
              <dd className="font-medium">
                {format(new Date(p.created_at), 'd MMM yyyy')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

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
                {p.first_name} has sign-in access.
              </p>
            ) : (
              <InviteControls person={p} />
            )}

            {!isSelf && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {p.status === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus('inactive')}
                    disabled={updatePerson.isPending}
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus('active')}
                    disabled={updatePerson.isPending}
                  >
                    <ArchiveRestore className="size-4" />
                    Reactivate
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
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
  )
}
