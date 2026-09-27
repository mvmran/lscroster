import { describe, expect, it } from 'vitest'
import {
  holdsAllPermissions,
  holdsPermission,
  PERMISSIONS,
  seesAllPlans,
  sortPermissions,
  type Permission,
} from '@/features/auth/permissions'

const none = new Set<Permission>()

describe('holdsPermission', () => {
  it('gives admins and coordinators every permission without a grant', () => {
    for (const { value } of PERMISSIONS) {
      expect(holdsPermission('admin', none, value)).toBe(true)
      expect(holdsPermission('coordinator', none, value)).toBe(true)
    }
    expect(holdsAllPermissions('member')).toBe(false)
  })

  it('gives a member only what they were granted', () => {
    const granted = new Set<Permission>(['manage_songs'])
    expect(holdsPermission('member', granted, 'manage_songs')).toBe(true)
    expect(holdsPermission('member', granted, 'publish_plans')).toBe(false)
    expect(holdsPermission('member', none, 'manage_songs')).toBe(false)
  })

  it('lets create & delete plans imply editing the order of service, not the reverse', () => {
    const creator = new Set<Permission>(['create_delete_plans'])
    const editor = new Set<Permission>(['edit_order_of_service'])
    expect(holdsPermission('member', creator, 'edit_order_of_service')).toBe(true)
    expect(holdsPermission('member', editor, 'create_delete_plans')).toBe(false)
  })

  it('treats a missing role as a member', () => {
    expect(holdsPermission(undefined, none, 'view_all_plans')).toBe(false)
  })
})

describe('seesAllPlans', () => {
  it('opens every plan to any plan permission', () => {
    for (const p of [
      'edit_order_of_service',
      'publish_plans',
      'create_delete_plans',
      'attach_plan_files',
      'view_all_plans',
    ] as Permission[]) {
      expect(seesAllPlans('member', new Set([p]))).toBe(true)
    }
  })

  it('does not open plans to song managers or plain members', () => {
    expect(seesAllPlans('member', new Set<Permission>(['manage_songs']))).toBe(false)
    expect(seesAllPlans('member', none)).toBe(false)
    expect(seesAllPlans('coordinator', none)).toBe(true)
  })
})

describe('sortPermissions', () => {
  it('orders by the list and drops duplicates', () => {
    expect(
      sortPermissions(['view_all_plans', 'manage_songs', 'edit_order_of_service', 'manage_songs']),
    ).toEqual(['edit_order_of_service', 'manage_songs', 'view_all_plans'])
  })
})
