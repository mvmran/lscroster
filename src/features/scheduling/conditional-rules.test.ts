import { describe, expect, it } from 'vitest'
import {
  findRuleCycle,
  personPositionKey,
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
    condition: { kind: 'attribute', attribute: 'sex', value: 'female' },
    strength: 'hard',
    enabled: true,
    ...overrides,
  }
}

const count = (targetPositionId: string, minCount: number) =>
  ({ kind: 'count', targetPositionId, minCount }) as const

// The canonical Vocals-balance pair from issue #113: WL female → 2 male vocals;
// WL male → 2 female vocals.
const RULE_A = rule({
  id: 'rule-a',
  name: 'Vocals balance (F)',
  effects: [count('male-vocals', 2), count('female-vocals', 1)],
})
const RULE_B = rule({
  id: 'rule-b',
  name: 'Vocals balance (M)',
  condition: { kind: 'attribute', attribute: 'sex', value: 'male' },
  effects: [count('male-vocals', 1), count('female-vocals', 2)],
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
      effects: [count('male-vocals', 3)],
    })
    const hard3 = rule({
      id: 'rule-hard',
      strength: 'hard',
      effects: [count('male-vocals', 3)],
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

  // --- person conditions + person / same-person effects ------------------------

  // Sam's package deal: when Sam leads, Sam plays guitar, Sharon plays keys,
  // and two female vocals are needed.
  const SAM_RULE = rule({
    id: 'rule-sam',
    name: 'Sam leads & plays',
    condition: { kind: 'person', personId: 'sam', personName: 'Sam Smith' },
    effects: [
      { kind: 'same-person', targetPositionId: 'guitar' },
      { kind: 'person', targetPositionId: 'keys', personId: 'sharon', personName: 'Sharon Lee' },
      count('female-vocals', 2),
    ],
  })
  const SAM_POSITIONS = [
    { id: 'wl', minCount: 1 },
    { id: 'guitar', minCount: 0 },
    { id: 'keys', minCount: 0 },
    { id: 'female-vocals', minCount: 1 },
  ]

  it('a person condition fires only for that person', () => {
    const dormant = resolveRequirements(
      input({
        positions: SAM_POSITIONS,
        rules: [SAM_RULE],
        assignments: [{ personId: 'tom', positionId: 'wl' }],
        people: [{ id: 'tom' }],
      }),
    )
    expect(dormant.evaluations[0].status).toBe('unmatched')
    expect(dormant.personRequirements).toEqual([])

    const fired = resolveRequirements(
      input({
        positions: SAM_POSITIONS,
        rules: [SAM_RULE],
        assignments: [{ personId: 'sam', positionId: 'wl' }],
        people: [{ id: 'sam' }],
      }),
    )
    expect(fired.evaluations[0]).toMatchObject({ status: 'fired', personIds: ['sam'] })
    expect(fired.personRequirements).toEqual([
      expect.objectContaining({ personId: 'sam', targetPositionId: 'guitar', via: 'same-person' }),
      expect.objectContaining({ personId: 'sharon', targetPositionId: 'keys', via: 'person' }),
    ])
    expect(fired.minimums.get('female-vocals')?.min).toBe(2)
    expect(fired.sanctioned).toEqual(
      new Set([personPositionKey('sam', 'guitar'), personPositionKey('sharon', 'keys')]),
    )
  })

  it('an any-condition mirror demands every trigger assignee on the target', () => {
    const mirror = rule({
      id: 'rule-mirror',
      condition: { kind: 'any' },
      triggerPositionId: 'wl',
      effects: [{ kind: 'same-person', targetPositionId: 'guitar' }],
    })
    const res = resolveRequirements(
      input({
        positions: SAM_POSITIONS,
        rules: [mirror],
        assignments: [
          { personId: 'sam', positionId: 'wl' },
          { personId: 'tom', positionId: 'wl' },
        ],
        people: [{ id: 'sam' }, { id: 'tom' }],
      }),
    )
    expect(res.personRequirements.map((r) => r.personId).sort()).toEqual(['sam', 'tom'])
    expect(res.evaluations[0].personIds).toEqual(['sam', 'tom'])
  })

  it('dedupes person requirements across rules, hard rule carrying attribution', () => {
    const soft = rule({
      id: 'a-soft',
      strength: 'soft',
      condition: { kind: 'any' },
      effects: [{ kind: 'same-person', targetPositionId: 'guitar' }],
    })
    const hard = rule({
      id: 'z-hard',
      strength: 'hard',
      condition: { kind: 'person', personId: 'sam' },
      effects: [{ kind: 'same-person', targetPositionId: 'guitar' }],
    })
    const res = resolveRequirements(
      input({
        positions: SAM_POSITIONS,
        rules: [soft, hard],
        assignments: [{ personId: 'sam', positionId: 'wl' }],
        people: [{ id: 'sam' }],
      }),
    )
    expect(res.personRequirements).toHaveLength(1)
    expect(res.personRequirements[0].rule.id).toBe('z-hard')
  })

  it('marks rules with deleted person references broken and never fires them', () => {
    const brokenCondition = rule({
      id: 'r-bc',
      condition: { kind: 'person', personId: null },
      effects: [count('guitar', 1)],
    })
    const brokenEffect = rule({
      id: 'r-be',
      condition: { kind: 'any' },
      effects: [{ kind: 'person', targetPositionId: 'keys', personId: null }],
    })
    const res = resolveRequirements(
      input({
        positions: SAM_POSITIONS,
        rules: [brokenCondition, brokenEffect],
        assignments: [{ personId: 'sam', positionId: 'wl' }],
        people: [{ id: 'sam' }],
      }),
    )
    expect(res.evaluations.map((e) => e.status)).toEqual(['broken', 'broken'])
    expect(res.personRequirements).toEqual([])
    expect(res.minimums.get('guitar')).toEqual({ min: 0, source: 'default' })
  })

  it('muting silences person requirements too', () => {
    const res = resolveRequirements(
      input({
        positions: SAM_POSITIONS,
        rules: [SAM_RULE],
        assignments: [{ personId: 'sam', positionId: 'wl' }],
        people: [{ id: 'sam' }],
        mutedRuleIds: new Set(['rule-sam']),
      }),
    )
    expect(res.evaluations[0].status).toBe('muted')
    expect(res.personRequirements).toEqual([])
    expect(res.sanctioned.size).toBe(0)
  })
})

describe('findRuleCycle', () => {
  it('accepts chains and rejects loops', () => {
    const chain = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [count('b', 1)] }),
      rule({ id: 'r2', triggerPositionId: 'b', effects: [count('c', 1)] }),
    ]
    expect(findRuleCycle(chain)).toBeNull()

    const loop = [
      ...chain,
      rule({ id: 'r3', triggerPositionId: 'c', effects: [count('a', 1)] }),
    ]
    const cycle = findRuleCycle(loop)
    expect(cycle).not.toBeNull()
    expect(cycle![0]).toBe(cycle![cycle!.length - 1])
  })

  it('ignores disabled rules', () => {
    const loop = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [count('b', 1)] }),
      rule({ id: 'r2', enabled: false, triggerPositionId: 'b', effects: [count('a', 1)] }),
    ]
    expect(findRuleCycle(loop)).toBeNull()
  })

  it('catches loops built from mirror (same-person) rules', () => {
    const loop = [
      rule({
        id: 'r1',
        triggerPositionId: 'a',
        condition: { kind: 'any' },
        effects: [{ kind: 'same-person', targetPositionId: 'b' }],
      }),
      rule({
        id: 'r2',
        triggerPositionId: 'b',
        condition: { kind: 'any' },
        effects: [{ kind: 'same-person', targetPositionId: 'a' }],
      }),
    ]
    expect(findRuleCycle(loop)).not.toBeNull()
  })
})

describe('rulePositionDepths', () => {
  it('orders triggers before targets, transitively', () => {
    const rules = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [count('b', 1)] }),
      rule({ id: 'r2', triggerPositionId: 'b', effects: [count('c', 1)] }),
    ]
    const depths = rulePositionDepths(rules)
    expect(depths.get('a')).toBe(0)
    expect(depths.get('b')).toBe(1)
    expect(depths.get('c')).toBe(2)
  })

  it('survives a (defensively broken) cycle', () => {
    const rules = [
      rule({ id: 'r1', triggerPositionId: 'a', effects: [count('b', 1)] }),
      rule({ id: 'r2', triggerPositionId: 'b', effects: [count('a', 1)] }),
    ]
    const depths = rulePositionDepths(rules)
    expect(depths.size).toBe(2)
  })
})

describe('ruleSentence', () => {
  const names: Record<string, string> = {
    wl: 'Worship Leader',
    guitar: 'Guitar',
    keys: 'Keys',
    foldback: 'Foldback',
    'male-vocals': 'Male Vocals',
    'female-vocals': 'Female Vocals',
  }
  const nameOf = (id: string) => names[id] ?? id

  it('renders attribute rules', () => {
    expect(ruleSentence(RULE_A, nameOf)).toBe(
      'If Worship Leader is female → Male Vocals ≥ 2, Female Vocals ≥ 1',
    )
  })

  it('renders person conditions and mixed effects', () => {
    const sam = rule({
      id: 'r-sam',
      condition: { kind: 'person', personId: 'sam', personName: 'Sam Smith' },
      effects: [
        { kind: 'same-person', targetPositionId: 'guitar' },
        { kind: 'person', targetPositionId: 'keys', personId: 'sharon', personName: 'Sharon Lee' },
        count('female-vocals', 2),
      ],
    })
    expect(ruleSentence(sam, nameOf)).toBe(
      'If Worship Leader is Sam Smith → Guitar: the same person, Keys: Sharon Lee, Female Vocals ≥ 2',
    )
  })

  it('renders a pure mirror rule as a linked-participation sentence', () => {
    const mirror = rule({
      id: 'r-mirror',
      condition: { kind: 'any' },
      effects: [{ kind: 'same-person', targetPositionId: 'foldback' }],
    })
    expect(ruleSentence(mirror, nameOf)).toBe(
      'Whoever is on Worship Leader also serves on Foldback',
    )
  })
})
