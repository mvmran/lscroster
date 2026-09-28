import { Checkbox } from '@/components/ui/checkbox'
import { PERMISSIONS, type Permission } from '@/features/auth/permissions'

/**
 * The six BAU permissions as checkboxes, with their one-line explanations.
 * Shared by the person page and the permission-template editor. Editing the
 * order of service shows as included (checked, locked) while Create & delete
 * plans is ticked, because that permission implies it. `heldOnly` drops the
 * unticked rows, for someone who can see the list but not change it.
 */
export function PermissionChecklist({
  value,
  onToggle,
  disabled = false,
  heldOnly = false,
  idPrefix,
}: {
  value: ReadonlySet<Permission>
  onToggle: (permission: Permission, checked: boolean) => void
  disabled?: boolean
  /** List only the permissions held (or implied) — no unticked boxes. */
  heldOnly?: boolean
  /** Keeps checkbox ids unique when two lists are on screen at once. */
  idPrefix: string
}) {
  const impliedEdit = value.has('create_delete_plans')
  return (
    <ul className="flex flex-col gap-1">
      {PERMISSIONS.map((p) => {
        const implied = p.value === 'edit_order_of_service' && impliedEdit
        if (heldOnly && !implied && !value.has(p.value)) return null
        const id = `${idPrefix}-${p.value}`
        return (
          <li key={p.value} className="flex items-start gap-3 rounded-md px-2 py-2">
            {/* Sibling label, not a wrapping one: a label around the radix
                checkbox re-forwards the click and cancels the toggle. */}
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={implied || value.has(p.value)}
              disabled={disabled || implied}
              onCheckedChange={(checked) => onToggle(p.value, checked === true)}
            />
            <label htmlFor={id} className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{p.label}</span>
              <span className="text-muted-foreground text-xs">
                {implied ? 'Included with Create & delete plans.' : p.description}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
