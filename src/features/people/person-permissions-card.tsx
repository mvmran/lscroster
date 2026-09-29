import { useState } from 'react'
import { KeyRound, LayoutTemplate, Loader2, Save } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  holdsAllPermissions,
  PERMISSION_LABELS,
  sortPermissions,
  type Permission,
} from '@/features/auth/permissions'
import {
  usePermissionTemplates,
  usePersonPermissions,
  useReplacePermissions,
  useSavePermissionTemplate,
  useTogglePermission,
  type PermissionTemplate,
} from '@/features/auth/use-permissions'
import { PermissionChecklist } from '@/features/people/permission-checklist'
import { ROLE_LABELS } from '@/features/people/person-utils'
import type { Enums } from '@/types/database'

const NONE = new Set<Permission>()

function listLabels(permissions: Iterable<Permission>) {
  const labels = sortPermissions(permissions).map((p) => PERMISSION_LABELS[p])
  return labels.length > 0 ? labels.join(', ') : 'no permissions'
}

/**
 * The BAU permissions a person holds (person page). Coordinators and admins
 * grant them — ticking saves at once — and can apply a permission template or
 * save this set as one. The person themselves, and anyone managing them, see
 * only what is held, read-only — a volunteer shouldn't read a row of unticked
 * boxes as jobs they're missing — and no card at all when nothing is. Admins
 * and coordinators hold every permission already, so for them the card just
 * says so.
 */
export function PersonPermissionsCard({
  personId,
  firstName,
  role,
  canManage,
}: {
  personId: string
  firstName: string
  role: Enums<'app_role'>
  /** Governance tier — admins + coordinators. */
  canManage: boolean
}) {
  const holdsAll = holdsAllPermissions(role)
  const query = usePersonPermissions(holdsAll ? undefined : personId)
  const granted = query.data ?? NONE
  const toggle = useTogglePermission(personId)
  const replace = useReplacePermissions(personId)
  const templates = usePermissionTemplates(canManage && !holdsAll)

  const [applying, setApplying] = useState<PermissionTemplate | null>(null)
  const [savingAs, setSavingAs] = useState(false)

  if (!holdsAll && !canManage && (query.isPending || granted.size === 0)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="text-muted-foreground size-4" />
          Permissions
        </CardTitle>
        <CardDescription>
          {holdsAll
            ? `${ROLE_LABELS[role]}s hold every permission — plans, publishing and songs — without being granted them.`
            : canManage
              ? `Day-to-day jobs ${firstName} can do as a member. Changes save straight away.`
              : `Day-to-day jobs ${firstName} can do beyond a member's usual access.`}
        </CardDescription>
      </CardHeader>
      {!holdsAll && (
        <CardContent className="flex flex-col gap-3">
          {query.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <PermissionChecklist
              idPrefix={`person-${personId}`}
              value={granted}
              heldOnly={!canManage}
              disabled={!canManage || replace.isPending}
              onToggle={(permission, checked) =>
                toggle.mutate(
                  { permission, granted: checked },
                  { onError: (e) => toast.error(e.message) },
                )
              }
            />
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value=""
                onValueChange={(id) =>
                  setApplying(templates.data?.find((t) => t.id === id) ?? null)
                }
                disabled={(templates.data ?? []).length === 0 || replace.isPending}
              >
                {/* Reads as an action, not a field: the Select greys its
                    placeholder, which made this look disabled beside the
                    Save button even with templates to choose from. */}
                <SelectTrigger
                  size="sm"
                  className="data-placeholder:text-foreground w-auto font-medium"
                  title={
                    (templates.data ?? []).length === 0
                      ? 'No permission templates yet — save one from here or in Settings'
                      : 'Replace these permissions with a template'
                  }
                >
                  <LayoutTemplate className="text-foreground size-4" />
                  <SelectValue placeholder="Apply template…" />
                </SelectTrigger>
                <SelectContent>
                  {(templates.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSavingAs(true)}
                disabled={granted.size === 0}
                title={
                  granted.size === 0
                    ? 'Tick some permissions first'
                    : 'Save these permissions as a template to apply to someone else'
                }
              >
                <Save className="size-4" />
                Save as template…
              </Button>
              {replace.isPending && <Loader2 className="size-4 animate-spin" />}
            </div>
          )}
        </CardContent>
      )}

      <AlertDialog open={!!applying} onOpenChange={(open) => !open && setApplying(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply “{applying?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {firstName}’s permissions become exactly: {listLabels(applying?.permissions ?? [])}.
              Anything else they hold now is removed. Later changes to the template
              won’t affect them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!applying) return
                const name = applying.name
                replace.mutate(applying.permissions, {
                  onSuccess: () => toast.success(`Applied “${name}”`),
                  onError: (e) => toast.error(e.message),
                })
                setApplying(null)
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {savingAs && (
        <SaveAsTemplateDialog
          permissions={sortPermissions(granted)}
          onClose={() => setSavingAs(false)}
        />
      )}
    </Card>
  )
}

function SaveAsTemplateDialog({
  permissions,
  onClose,
}: {
  permissions: Permission[]
  onClose: () => void
}) {
  const save = useSavePermissionTemplate()
  const [name, setName] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    save.mutate(
      { name, permissions },
      {
        onSuccess: () => {
          toast.success(`Saved template “${name.trim()}”`)
          onClose()
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save as permission template</DialogTitle>
            <DialogDescription>{listLabels(permissions)}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="permission-template-name">Template name</Label>
            <Input
              id="permission-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Song librarian"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
