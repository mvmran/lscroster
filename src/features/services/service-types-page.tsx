import { useState } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatStartTime, type ServiceType } from '@/features/services/service-utils'
import {
  useCreateServiceType,
  useDeleteServiceType,
  useReorderServiceType,
  useServiceTypes,
  useUpdateServiceType,
} from '@/features/services/use-service-types'

function ServiceTypeDialog({
  serviceType,
  open,
  onOpenChange,
}: {
  serviceType: ServiceType | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateServiceType()
  const update = useUpdateServiceType()
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('')

  // Reset the fields each time the dialog opens for a different target.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const target = serviceType?.id ?? 'new'
  if (open && seededFor !== target) {
    setSeededFor(target)
    setName(serviceType?.name ?? '')
    setStartTime(serviceType?.default_start_time?.slice(0, 5) ?? '')
  }
  if (!open && seededFor !== null) setSeededFor(null)

  const pending = create.isPending || update.isPending

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    const values = {
      name: trimmed,
      default_start_time: startTime ? `${startTime}:00` : null,
    }
    try {
      if (serviceType) {
        await update.mutateAsync({ id: serviceType.id, values })
      } else {
        await create.mutateAsync(values)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {serviceType ? 'Edit service type' : 'New service type'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="st-name">Name</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunday 10am"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="st-time">Default start time</Label>
            <Input
              id="st-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-40"
            />
            <p className="text-muted-foreground text-xs">
              Used to compute the running clock on the order of service.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {serviceType ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ServiceTypesPage() {
  const { data: serviceTypes, isPending } = useServiceTypes()
  const reorder = useReorderServiceType()
  const remove = useDeleteServiceType()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceType | null>(null)
  const [deleting, setDeleting] = useState<ServiceType | null>(null)

  function move(index: number, direction: -1 | 1) {
    if (!serviceTypes) return
    const neighbour = serviceTypes[index + direction]
    const current = serviceTypes[index]
    if (!neighbour) return
    // sort_order values may be equal (both default 0); fall back to indexes.
    const a = { id: current.id, sort_order: index }
    const b = { id: neighbour.id, sort_order: index + direction }
    reorder.mutate(
      { a, b },
      { onError: (e) => toast.error(e.message) },
    )
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success(`Deleted ${deleting.name}`)
      setDeleting(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Service types</h1>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-4" />
          Add service type
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Recurring gatherings you plan services for, e.g. “Sunday 10am”.
      </p>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : !serviceTypes || serviceTypes.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <CalendarDays className="size-8" />
            No service types yet. Add one to start planning services.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {serviceTypes.map((st, index) => (
            <Card key={st.id} className="py-3">
              <CardContent className="flex items-center gap-2 px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{st.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatStartTime(st.default_start_time) ?? 'No default start time'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${st.name} up`}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={index === serviceTypes.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${st.name} down`}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(st)
                    setDialogOpen(true)
                  }}
                  aria-label={`Edit ${st.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleting(st)}
                  aria-label={`Delete ${st.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ServiceTypeDialog
        serviceType={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the service type <strong>and every plan
              under it</strong>, including their orders of service. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
