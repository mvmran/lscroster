import { describe, expect, it } from 'vitest'
import { applyTeamOrder } from '@/features/scheduling/use-matrix-team-order'

const t = (id: string) => ({ id, name: id.toUpperCase() })

describe('applyTeamOrder', () => {
  it('returns teams unchanged when no saved order', () => {
    const teams = [t('a'), t('b'), t('c')]
    expect(applyTeamOrder(teams, []).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts teams by their index in the saved order', () => {
    const teams = [t('a'), t('b'), t('c')]
    expect(applyTeamOrder(teams, ['c', 'a', 'b']).map((x) => x.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('appends teams missing from the saved order, after the ordered ones', () => {
    // `d` is new (created after the order was saved) — never hidden.
    const teams = [t('a'), t('b'), t('c'), t('d')]
    expect(applyTeamOrder(teams, ['c', 'a']).map((x) => x.id)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })

  it('keeps unknown ids in the saved order from disturbing present teams', () => {
    // `z` was deleted; its presence in the saved order must not break sorting.
    const teams = [t('a'), t('b')]
    expect(applyTeamOrder(teams, ['z', 'b', 'a']).map((x) => x.id)).toEqual([
      'b',
      'a',
    ])
  })

  it('does not mutate the input array', () => {
    const teams = [t('a'), t('b')]
    const before = teams.map((x) => x.id)
    applyTeamOrder(teams, ['b', 'a'])
    expect(teams.map((x) => x.id)).toEqual(before)
  })
})
