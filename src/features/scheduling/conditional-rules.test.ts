import { describe, expect, it } from 'vitest'
import {
  findRuleCycle,
  resolveRequirements,
  rulePositionDepths,
  ruleSentence,
  type ConditionalRule,
  type ResolveInput,
} from './conditional-rules'

function rule(
  overrides: Partial<ConditionalRule> & { id: string; effects: ConditionalRule['effects'] },
): ConditionalRule {
  return {
    name: overrides.id,
    serviceTypeId: null,
    triggerPositionId: 'wl',
    triggerAttribute: 'sex',
    triggerValue: 'female',
    strength: 'hard',
    enabled: true,
    ...overrides,
  }
}

// The canonical Vocals-balance pair from issue #113: WL female → 2 male vocals;
// WL male → 2 female vocals.
const RULE_A = rule({
  id: 'rule-a',
  name: 'Vocals balance (F)',
  triggerValue: 'female',
  effects: [
    { targetPositionId: 'male-vocals', minCount: 2 },
    { targetPositionId: 'female-vocals', minCount: 1 },
  ],
})
const RULE_B = rule({
  id: 'rule-b',
  name: 'Vocals balance (M)',
  triggerValue: 'male',
  effects: [
    { targetPositionId: 'male-vocals', minCount: 1 },
    { targetPositionId: 'female-vocals', minCount: 2 },
  ],
})

function input(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return {
    serviceTypeId: 'svc',
    positions: [
      { id: 'wl', minCount: 1 },
      { id: 'male-vocals', minCount: 1 },
      { id: 'female-vocals', minCount: 1 },
    ],
    assignments: [],
    people: [],
    rules: [RULE_A, RULE_B],
    ...overrides,
  }
}

describe('resolveRequirements', () => {
  it('uses team defaults when the trigger position is unfilled (rules dormant)', () => {
    const res = resolveRequirements(input())
    expect(res.minimums.get('male-vocals')).toEqual({ min: 1, source: 'default' })
    expect(res.evaluations.map((e) => e.status)).toEqual(['dormant', 'dormant'])
  })

  it('fires the matching rule and leaves the other unmatched', () => {
    const res = resolveRequirements(
      input({
        assignments: [{ personId: 'sarah', positionId: 'wl' }],
        people: [{ id: 'sarah', sex: 'female' }],
      }),
    )
    expect(res.minimums.get('male-vocals')).toMatchObject({ min: 2, source: 'rule' })
    expect(res.minimums.get('male-vocals')?.rule?.id).toBe('rule-a')
    expect(res.minimums.get('female-vocals')).toMatchObject({ min: 1, source: 'rule' })
    const byId = new Map(res.evaluations.map((e) => [e.rule.id, e]))
    expect(byId.get('rule-a')).toMatchObject({ status: 'fired', personIds: ['sarah'] })
    expect(byId.get('rule-b')?.status).toBe('unmatched')
  })

  it('a fired rule replaces the team default even when lower', () => {
    const res = resolveRequirements(
      input({
        positions: [
          { id: 'wl', minCount: 1 },
          { id: 'male-vocals', minCount: 3 },
          { id: 'female-vocals', minCount: 1 },
        ],
        assignments: [{ personId: 'sarah', positionId: 'wl' }],
        people: [{ id: 'sarah', sex: 'female' }],
      }),
    )
    expect(res.minimums.get('male-vocals')).toMatchObject({ min: 2, source: 'rule' })
  })

  it('reports unevaluable when the trigger assignee has no recorded attribute', () => {
    const res = resolveRequirements(
      input({
        assignments: [{ personId: 'sam', positionId: 'wl' }],
        people: [{ id: 'sam', sex: null }],
      }),
    )
    expect(res.minimums.get('male-vocals')).toEqual({ min: 1, source: 'default' })
    expect(res.evaluations.every((e) => e.status === 'unevaluable')).toBe(true)
    expect(res.evaluations[0].personIds).toEqual(['sam'])
  })

  it('takes the max when two fired rules hit the same target, hard breaking ties', () => {
    const soft3 = rule({
      id: 'rule-soft',
      strength: 'soft',
      triggerValue: 'female',
      effects: [{ targetPositionId: 'male-vocals', minCount: 3 }],
    })
    const hard3 = rule({
      id: 'rule-hard',
      strength: 'hard',
      triggerValue: 'female',
      effects: [{ targetPositionId: 'male-vocals', minCount: 3 }],
    })
    const res = resolveRequirements(
      input({
        rules: [RULE_A, soft3, hard3],
        assignments: [{ personId: 'sarah', positionId: 'wl' }],
        people: [{ id: 'sarah', sex: 'female' }],
      }),
    )
    expect(res.minimums.get('male-vocals')).toMatchObject({ min: 3, source: 'rule' })
    expect(res.minimums.get('male-vocals')?.rule?.id).toBe('rule-hard')
  })

  it('manual plan overrides beat fired rules', () => {
    const res = resolveRequirements(
      input({
        assignments: [{ personId: 'sarah', positionId: 'wl' }],
        people: [{ id: 'sarah', sex: 'female' }],
        planMinOverrides: new Map([['male-vocals', 0]]),
      }),
    )
    expect(res.minimums.get('male-vocals')).toEqual({ min: 0, source: 'plan-override' })
  })

  it('skips muted, disabled, other-service-type and trigger-absent rules', () => {
    const otherSvc = rule({ id: 'r-svc', serviceTypeId: 'other', effects: RULE_A.effects })
    const disabled = rule({ id: 'r-off', enabled: false, effects: RULE_A.effects })
    const foreign = rule({ id: 'r-foreign', triggerPositionId: 'nope', effects: RULE_A.effects })
    const res = resolveRequirements(
      input({
        rules: [RULE_A, otherSvc, disabled, foreign],
        assignments: [{ personId: 'sarah', positionId: 'wl' }],
        people: [{ id: 'sarah', sex: 'female' }],
        mutedRuleIds: new Set(['rule-a']),
      }),
    )
    expect(res.minimums.get('male-vocals')).toEqual({ min: 1, source: 'default' })
    expect(res.evaluations).toEqual([
      expect.objectContaining({ rule: RULE_A, status: 'muted' }),
    ])
  })

  it('fires on any matching assignee when the trigger position holds several people', () => {
    const res = resolveRequirements(
      input({
        assignments: [
          { personId: 'sarah', positionId: 'wl' },
          { personId: 'dave', positionId: 'wl' },
        ],
        people: [
          { id: 'sarah', sex: 'female' },
          { id: 'dave', sex: 'male' },
        ],
      }),
    )
    // both rules fire; max wins per target
    expect(res.minimums.get('male-vocals')?.min).toBe(2)
    expect(res.minimums.get('female-vocals')?.min).toBe(2)
  })
})

describe('findRuleCycle', () => {
  it('accepts chains and rejects loops', () => {
    const chain = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [{ targetPositionId: 'b', minCount: 1 }] }),
      rule({ id: 'r2', triggerPositionId: 'b', effects: [{ targetPositionId: 'c', minCount: 1 }] }),
    ]
    expect(findRuleCycle(chain)).toBeNull()

    const loop = [
      ...chain,
      rule({ id: 'r3', triggerPositionId: 'c', effects: [{ targetPositionId: 'a', minCount: 1 }] }),
    ]
    const cycle = findRuleCycle(loop)
    expect(cycle).not.toBeNull()
    expect(cycle![0]).toBe(cycle![cycle!.length - 1])
  })

  it('ignores disabled rules', () => {
    const loop = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [{ targetPositionId: 'b', minCount: 1 }] }),
      rule({ id: 'r2', enabled: false, triggerPositionId: 'b', effects: [{ targetPositionId: 'a', minCount: 1 }] }),
    ]
    expect(findRuleCycle(loop)).toBeNull()
  })
})

describe('rulePositionDepths', () => {
  it('orders triggers before targets, transitively', () => {
    const rules = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [{ targetPositionId: 'b', minCount: 1 }] }),
      rule({ id: 'r2', triggerPositionId: 'b', effects: [{ targetPositionId: 'c', minCount: 1 }] }),
    ]
    const depths = rulePositionDepths(rules)
    expect(depths.get('a')).toBe(0)
    expect(depths.get('b')).toBe(1)
    expect(depths.get('c')).toBe(2)
  })

  it('survives a (defensively broken) cycle', () => {
    const rules = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [{ targetPositionId: 'b', minCount: 1 }] }),
      rule({ id: 'r2', triggerPositionId: 'b', effects: [{ targetPositionId: 'a', minCount: 1 }] }),
    ]
    const depths = rulePositionDepths(rules)
    expect(depths.size).toBe(2)
  })
})

describe('ruleSentence', () => {
  it('renders the readable summary', () => {
    const names: Record<string, string> = {
      wl: 'Worship Leader',
      'male-vocals': 'Male Vocals',
      'female-vocals': 'Female Vocals',
    }
    expect(ruleSentence(RULE_A, (id) => names[id] ?? id)).toBe(
      'If Worship Leader is female → Male Vocals ≥ 2, Female Vocals ≥ 1',
    )
  })
})
