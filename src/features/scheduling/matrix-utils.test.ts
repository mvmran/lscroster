import { describe, expect, it } from 'vitest'
import { fillMatrixWindow } from '@/features/scheduling/matrix-utils'

const plans = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' },
]

describe('fillMatrixWindow (issues #67 / #68)', () => {
  it('takes `count` plans from the start index when nothing is collapsed', () => {
    expect(fillMatrixWindow(plans, 0, 3, new Set())).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])
  })

  it('honours the start index (week paging)', () => {
    expect(fillMatrixWindow(plans, 2, 2, new Set())).toEqual([{ id: 'c' }, { id: 'd' }])
  })

  it('skips a collapsed plan and pulls the next one in to keep the count', () => {
    expect(fillMatrixWindow(plans, 0, 3, new Set(['b']))).toEqual([
      { id: 'a' },
      { id: 'c' },
      { id: 'd' },
    ])
  })

  it('skips several collapsed plans', () => {
    expect(fillMatrixWindow(plans, 0, 2, new Set(['a', 'b', 'c']))).toEqual([
      { id: 'd' },
      { id: 'e' },
    ])
  })

  it('returns fewer than `count` when the list runs out', () => {
    expect(fillMatrixWindow(plans, 3, 4, new Set(['e']))).toEqual([{ id: 'd' }])
  })

  it('clamps a negative start index to 0', () => {
    expect(fillMatrixWindow(plans, -2, 1, new Set())).toEqual([{ id: 'a' }])
  })
})
