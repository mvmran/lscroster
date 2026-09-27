import type { Enums } from '@/types/database'

/** A grantable BAU permission (the `app_permission` enum). */
export type Permission = Enums<'app_permission'>

type Role = Enums<'app_role'>

export interface PermissionOption {
  value: Permission
  label: string
  description: string
}

/**
 * Every BAU permission, in the order the person page lists them. The labels
 * match the audit-log summaries written by `audit_person_permission()`.
 */
export const PERMISSIONS: readonly PermissionOption[] = [
  {
    value: 'edit_order_of_service',
    label: 'Edit order of service',
    description: 'Items, songs and keys in a plan, its times, notes and details.',
  },
  {
    value: 'publish_plans',
    label: 'Publish plans',
    description: 'Publish and unpublish (emails the roster) and email the set list.',
  },
  {
    value: 'create_delete_plans',
    label: 'Create & delete plans',
    description: 'New, duplicate and delete plans, and plan templates. Includes editing the order of service.',
  },
  {
    value: 'manage_songs',
    label: 'Manage songs',
    description: 'Add, edit and archive songs, arrangements, lyrics and song files.',
  },
  {
    value: 'attach_plan_files',
    label: 'Attach files to plans',
    description: 'Add and remove a plan’s attachments.',
  },
  {
    value: 'view_all_plans',
    label: 'View all plans & lyrics sheets',
    description: 'See every plan, drafts included, and print its lyrics sheet.',
  },
]

export const PERMISSION_LABELS = Object.fromEntries(
  PERMISSIONS.map((p) => [p.value, p.label]),
) as Record<Permission, string>

/** Permissions that also let a member see every plan (mirrors `can_see_all_plans()`). */
const PLAN_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'edit_order_of_service',
  'publish_plans',
  'create_delete_plans',
  'attach_plan_files',
  'view_all_plans',
])

/** Admins and coordinators hold every permission without a grant. */
export function holdsAllPermissions(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'coordinator'
}

/**
 * Does someone with this role and these grants hold `permission`? Mirrors the
 * `has_permission()` RLS helper: create_delete_plans implies
 * edit_order_of_service, because creating a plan writes its order.
 */
export function holdsPermission(
  role: Role | null | undefined,
  granted: ReadonlySet<Permission>,
  permission: Permission,
): boolean {
  if (holdsAllPermissions(role)) return true
  if (granted.has(permission)) return true
  return permission === 'edit_order_of_service' && granted.has('create_delete_plans')
}

/** Does someone with this role and these grants see every plan, drafts included? */
export function seesAllPlans(
  role: Role | null | undefined,
  granted: ReadonlySet<Permission>,
): boolean {
  if (holdsAllPermissions(role)) return true
  for (const p of granted) if (PLAN_PERMISSIONS.has(p)) return true
  return false
}

/** Sort a permission list into the canonical PERMISSIONS order, without duplicates. */
export function sortPermissions(list: Iterable<Permission>): Permission[] {
  const set = new Set(list)
  return PERMISSIONS.map((p) => p.value).filter((p) => set.has(p))
}
