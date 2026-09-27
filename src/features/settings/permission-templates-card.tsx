import { useState } from 'react'
import { LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PERMISSION_LABELS,
  sortPermissions,
  type Permission,
} from '@/features/auth/permissions'
import {
  useDeletePermissionTemplate,
  usePermissionTemplates,
  useSavePermissionTemplate,
  type PermissionTemplate,
} from '@/features/auth/use-permissions'
import { PermissionChecklist } from '@/features/people/permission-checklist'

/**
 * Settings → Permission templates (admins + coordinators): named sets of BAU
 * permissions, applied from a person's page. A template is a preset — applying
 * copies its permissions — so editing or deleting one here changes nobody.
 */
export function PermissionTemplatesCard() {
  const templates = usePermissionTemplates()
  const remove = useDeletePermissionTemplate()
  const [editing, setEditing] = useState<PermissionTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<PermissionTemplate | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutTemplate className="text-muted-foreground size-4" />
          Permission templates
        </CardTitle>
        <CardDescription>
          Named sets of permissions to apply from a person’s page, e.g. “Song
          librarian”. Applying copies the permissions, so changing or deleting a
          template here doesn’t change anyone who already has them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {templates.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (templates.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">No templates yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(templates.data ?? []).map((t) => (
              <li
                key={t.id}
                className="hover:bg-accent/40 flex items-start gap-2 rounded-md px-2 py-1.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {t.permissions.length === 0 ? (
                      <span className="text-muted-foreground text-xs">No permissions</span>
                    ) : (
                      sortPermissions(t.permissions).map((p) => (
                        <Badge key={p} variant="secondary" className="font-normal">
                          {PERMISSION_LABELS[p]}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setEditing(t)}
                  aria-label={`Edit ${t.name}`}
                  title={`Edit ${t.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setDeleting(t)}
                  aria-label={`Delete ${t.name}`}
                  title={`Delete ${t.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            New template
          </Button>
        </div>
      </CardContent>

      {editing && (
        <TemplateDialog
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              People it was applied to keep their permissions — only the template
              goes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleting) return
                remove.mutate(deleting.id, { onError: (e) => toast.error(e.message) })
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function TemplateDialog({
  template,
  onClose,
}: {
  template: PermissionTemplate | null
  onClose: () => void
}) {
  const save = useSavePermissionTemplate()
  const [name, setName] = useState(template?.name ?? '')
  const [permissions, setPermissions] = useState<Set<Permission>>(
    () => new Set(template?.permissions ?? []),
  )

  function toggle(permission: Permission, checked: boolean) {
    setPermissions((current) => {
      const next = new Set(current)
      if (checked) next.add(permission)
      else next.delete(permission)
      return next
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    save.mutate(
      { id: template?.id, name, permissions: [...permissions] },
      {
        onSuccess: () => {
          toast.success(template ? 'Template saved' : `Created “${name.trim()}”`)
          onClose()
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{template ? 'Edit template' : 'New permission template'}</DialogTitle>
            <DialogDescription>
              Tick the permissions this template gives.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Song librarian"
              autoFocus
            />
          </div>
          <PermissionChecklist
            idPrefix="template"
            value={permissions}
            onToggle={toggle}
            disabled={save.isPending}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
