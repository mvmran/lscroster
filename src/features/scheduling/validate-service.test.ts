import { describe, expect, it } from 'vitest'
import {
  checkAvailability,
  checkCadence,
  checkConditionalRules,
  checkCoverage,
  checkEligibility,
  checkInactive,
  checkMultiPosition,
  checkPairings,
  checkPersonRequirements,
  checkSupervision,
  consecutiveRun,
  isLastWeekdayOfMonth,
  isUnavailableOn,
  matchesRecurring,
  validateService,
  weekOfMonth,
  type ServiceState,
  type ValidationAssignment,
  type ValidationPerson,
  type ValidationPosition,
} from './validate-service'

// 2026-06-15 is a Monday, so 2026-07-05 is the 1st Sunday of July; 2026-07-26
// is the last Sunday of July.
const SUNDAY = '2026-07-05'
const SVC_TYPE = 'svc-sunday'

function person(overrides: Partial<ValidationPerson> & { id: string }): ValidationPerson {
  return {
    name: overrides.id,
    status: 'active',
    minGapDays: 0,
    maxPerMonth: null,
    targetPerMonth: null,
    maxConsecutive: null,
    eligibility: {},
    blockouts: [],
    recurringUnavailability: [],
    history: [],
    ...overrides,
  }
}

function position(overrides: Partial<ValidationPosition> & { id: string }): ValidationPosition {
  return {
    name: overrides.id,
    teamId: 'team-1',
    teamName: 'Team 1',
    minCount: 0,
    maxCount: null,
    requiresLevel: null,
    ...overrides,
  }
}

function assign(
  personId: string,
  positionId: string,
  overrides: Partial<ValidationAssignment> = {},
): ValidationAssignment {
  return { personId, positionId, teamId: 'team-1', status: 'pending', ...overrides }
}

function state(overrides: Partial<ServiceState> = {}): ServiceState {
  return {
    service: { id: 'plan-1', date: SUNDAY, serviceTypeId: SVC_TYPE },
    positions: [],
    assignments: [],
    people: [],
    pairings: [],
    ...overrides,
  }
}

describe('date helpers', () => {
  it('computes the week of the month', () => {
    expect(weekOfMonth(new Date(2026, 6, 5))).toBe(1)
    expect(weekOfMonth(new Date(2026, 6, 26))).toBe(4)
  })

  it('detects the last weekday of the month', () => {
    expect(isLastWeekdayOfMonth(new Date(2026, 6, 26))).toBe(true) // last Sun of July
    expect(isLastWeekdayOfMonth(new Date(2026, 6, 5))).toBe(false)
  })

  it('matches recurring rules', () => {
    const date = new Date(2026, 6, 5) // 1st Sunday
    expect(matchesRecurring({ weekOfMonth: null, weekday: 0 }, date)).toBe(true)
    expect(matchesRecurring({ weekOfMonth: 1, weekday: 0 }, date)).toBe(true)
    expect(matchesRecurring({ weekOfMonth: 2, weekday: 0 }, date)).toBe(false)
    expect(matchesRecurring({ weekOfMonth: -1, weekday: 0 }, date)).toBe(false)
    expect(matchesRecurring({ weekOfMonth: 1, weekday: 1 }, date)).toBe(false)
  })

  it('combines blockouts and recurring rules', () => {
    const p = person({
      id: 'a',
      blockouts: [{ start: '2026-07-01', end: '2026-07-10' }],
    })
    expect(isUnavailableOn(p, SUNDAY)).toBe(true)
    expect(isUnavailableOn(p, '2026-07-20')).toBe(false)
    const r = person({ id: 'b', recurringUnavailability: [{ weekOfMonth: 1, weekday: 0 }] })
    expect(isUnavailableOn(r, SUNDAY)).toBe(true)
  })
})

describe('checkEligibility', () => {
  it('flags an assignee not set up for the position', () => {
    const s = state({
      positions: [position({ id: 'pos-1', name: 'Drums' })],
      assignments: [assign('a', 'pos-1')],
      people: [person({ id: 'a', name: 'Ann' })],
    })
    const results = checkEligibility(s)
    expect(results).toHaveLength(1)
    expect(results[0].code).toBe('NOT_ELIGIBLE')
  })

  it('passes an eligible assignee', () => {
    const s = state({
      positions: [position({ id: 'pos-1' })],
      assignments: [assign('a', 'pos-1')],
      people: [person({ id: 'a', eligibility: { 'pos-1': 'qualified' } })],
    })
    expect(checkEligibility(s)).toHaveLength(0)
  })
})

describe('checkAvailability', () => {
  it('flags a blocked-out assignee but ignores declined ones', () => {
    const s = state({
      positions: [position({ id: 'pos-1' })],
      assignments: [assign('a', 'pos-1'), assign('b', 'pos-1', { status: 'declined' })],
      people: [
        person({ id: 'a', name: 'Ann', blockouts: [{ start: SUNDAY, end: SUNDAY }] }),
        person({ id: 'b', name: 'Bob', blockouts: [{ start: SUNDAY, end: SUNDAY }] }),
      ],
    })
    const results = checkAvailability(s)
    expect(results).toHaveLength(1)
    expect(results[0].personIds).toEqual(['a'])
    expect(results[0].code).toBe('UNAVAILABLE_SCHEDULED')
  })
})

describe('checkInactive', () => {
  it('flags a person on a break', () => {
    const s = state({
      assignments: [assign('a', 'pos-1')],
      people: [person({ id: 'a', name: 'Ann', status: 'break' })],
    })
    const results = checkInactive(s)
    expect(results).toHaveLength(1)
    expect(results[0].code).toBe('INACTIVE_SCHEDULED')
  })
})

describe('checkMultiPosition', () => {
  it('flags a person in two positions but not two people in one', () => {
    const s = state({
      positions: [position({ id: 'pos-1' }), position({ id: 'pos-2' })],
      assignments: [assign('a', 'pos-1'), assign('a', 'pos-2'), assign('b', 'pos-1')],
      people: [person({ id: 'a', name: 'Ann' }), person({ id: 'b', name: 'Bob' })],
    })
    const results = checkMultiPosition(s)
    expect(results).toHaveLength(1)
    expect(results[0].personIds).toEqual(['a'])
  })
})

describe('checkPairings', () => {
  const base = {
    positions: [position({ id: 'pos-1' }), position({ id: 'pos-2' })],
    assignments: [assign('a', 'pos-1'), assign('b', 'pos-2')],
    people: [person({ id: 'a', name: 'Ann' }), person({ id: 'b', name: 'Bob' })],
  }

  it('errors on a hard avoid pair both present', () => {
    const results = checkPairings(
      state({ ...base, pairings: [{ personA: 'a', personB: 'b', kind: 'avoid', strength: 'hard' }] }),
    )
    expect(results[0].code).toBe('AVOID_PAIR_TOGETHER')
    expect(results[0].severity).toBe('error')
  })

  it('warns on a soft avoid pair', () => {
    const results = checkPairings(
      state({ ...base, pairings: [{ personA: 'a', personB: 'b', kind: 'avoid', strength: 'soft' }] }),
    )
    expect(results[0].code).toBe('SOFT_AVOID_TOGETHER')
    expect(results[0].severity).toBe('warning')
  })

  it('ignores prefer/together pairings and one-sided presence', () => {
    expect(
      checkPairings(
        state({ ...base, pairings: [{ personA: 'a', personB: 'b', kind: 'prefer', strength: 'soft' }] }),
      ),
    ).toHaveLength(0)
    expect(
      checkPairings(
        state({
          positions: base.positions,
          assignments: [assign('a', 'pos-1')],
          people: base.people,
          pairings: [{ personA: 'a', personB: 'b', kind: 'avoid', strength: 'hard' }],
        }),
      ),
    ).toHaveLength(0)
  })
})

describe('checkCoverage', () => {
  it('flags an unfilled mandatory position', () => {
    const s = state({ positions: [position({ id: 'pos-1', minCount: 2 })], assignments: [assign('a', 'pos-1')], people: [person({ id: 'a' })] })
    const results = checkCoverage(s)
    expect(results.map((r) => r.code)).toContain('MANDATORY_UNFILLED')
  })

  it('counts a trainee toward min_count', () => {
    const s = state({
      positions: [position({ id: 'pos-1', minCount: 1 })],
      assignments: [assign('a', 'pos-1')],
      people: [person({ id: 'a', eligibility: { 'pos-1': 'trainee' } })],
    })
    expect(checkCoverage(s).some((r) => r.code === 'MANDATORY_UNFILLED')).toBe(false)
  })

  it('requires a qualified person when the position needs the level', () => {
    const onlyTrainee = state({
      positions: [position({ id: 'pos-1', minCount: 1, requiresLevel: 'qualified' })],
      assignments: [assign('a', 'pos-1')],
      people: [person({ id: 'a', eligibility: { 'pos-1': 'trainee' } })],
    })
    expect(checkCoverage(onlyTrainee).some((r) => r.code === 'NO_REQUIRED_LEVEL')).toBe(true)

    const withQualified = state({
      positions: [position({ id: 'pos-1', minCount: 1, requiresLevel: 'qualified' })],
      assignments: [assign('a', 'pos-1'), assign('b', 'pos-1')],
      people: [
        person({ id: 'a', eligibility: { 'pos-1': 'trainee' } }),
        person({ id: 'b', eligibility: { 'pos-1': 'qualified' } }),
      ],
    })
    expect(checkCoverage(withQualified).some((r) => r.code === 'NO_REQUIRED_LEVEL')).toBe(false)
  })
})

describe('checkSupervision', () => {
  it('warns when a team is all trainees, not when a qualified is present', () => {
    const allTrainees = state({
      positions: [position({ id: 'pos-1' }), position({ id: 'pos-2' })],
      assignments: [assign('a', 'pos-1'), assign('b', 'pos-2')],
      people: [
        person({ id: 'a', eligibility: { 'pos-1': 'trainee' } }),
        person({ id: 'b', eligibility: { 'pos-2': 'trainee' } }),
      ],
    })
    expect(checkSupervision(allTrainees).some((r) => r.code === 'TRAINEE_UNSUPERVISED')).toBe(true)

    const supervised = state({
      positions: [position({ id: 'pos-1' }), position({ id: 'pos-2' })],
      assignments: [assign('a', 'pos-1'), assign('b', 'pos-2')],
      people: [
        person({ id: 'a', eligibility: { 'pos-1': 'trainee' } }),
        person({ id: 'b', eligibility: { 'pos-2': 'qualified' } }),
      ],
    })
    expect(checkSupervision(supervised)).toHaveLength(0)
  })
})

describe('checkCadence', () => {
  it('warns when scheduled inside the minimum gap', () => {
    const s = state({
      assignments: [assign('a', 'pos-1')],
      people: [
        person({ id: 'a', minGapDays: 14, history: [{ date: '2026-06-28', serviceTypeId: SVC_TYPE }] }),
      ],
    })
    expect(checkCadence(s).some((r) => r.code === 'OVER_CADENCE')).toBe(true)
  })

  it('warns over the monthly cap and under the monthly target', () => {
    const over = state({
      assignments: [assign('a', 'pos-1')],
      people: [
        person({
          id: 'a',
          maxPerMonth: 1,
          history: [{ date: '2026-07-19', serviceTypeId: SVC_TYPE }],
        }),
      ],
    })
    expect(checkCadence(over).some((r) => r.code === 'OVER_CADENCE')).toBe(true)

    const under = state({
      assignments: [assign('a', 'pos-1')],
      people: [person({ id: 'a', targetPerMonth: 3 })],
    })
    expect(checkCadence(under).some((r) => r.code === 'UNDER_TARGET')).toBe(true)
  })

  it('warns when exceeding consecutive services', () => {
    const s = state({
      assignments: [assign('a', 'pos-1')],
      people: [
        person({
          id: 'a',
          maxConsecutive: 2,
          history: [
            { date: '2026-06-21', serviceTypeId: SVC_TYPE },
            { date: '2026-06-28', serviceTypeId: SVC_TYPE },
          ],
        }),
      ],
    })
    expect(checkCadence(s).some((r) => r.code === 'MAX_CONSECUTIVE')).toBe(true)
  })

  it('computes a consecutive run by weekly adjacency', () => {
    expect(consecutiveRun(SUNDAY, ['2026-06-28', '2026-06-21'])).toBe(3)
    expect(consecutiveRun(SUNDAY, ['2026-06-07'])).toBe(1) // gap > 8 days
  })
})

describe('validateService', () => {
  it('splits errors from warnings and ignores declined assignments', () => {
    const s = state({
      positions: [position({ id: 'pos-1', minCount: 1, requiresLevel: 'qualified' })],
      assignments: [
        assign('a', 'pos-1', { status: 'declined' }), // ignored entirely
        assign('b', 'pos-1'),
      ],
      people: [
        person({ id: 'a', name: 'Ann' }),
        // Bob is eligible-but-trainee and on a break: one error (inactive),
        // one error (no qualified level), and an unsupervised-team warning.
        person({ id: 'b', name: 'Bob', status: 'break', eligibility: { 'pos-1': 'trainee' } }),
      ],
    })
    const { errors, warnings } = validateService(s)
    const codes = errors.map((e) => e.code)
    expect(codes).toContain('INACTIVE_SCHEDULED')
    expect(codes).toContain('NO_REQUIRED_LEVEL')
    expect(codes).not.toContain('MANDATORY_UNFILLED') // trainee fills the slot
    expect(warnings.map((w) => w.code)).toContain('TRAINEE_UNSUPERVISED')
  })
})

describe('conditional rules (issue #113)', () => {
  const VOCALS_RULE = {
    id: 'rule-a',
    name: 'Vocals balance',
    serviceTypeId: null,
    triggerPositionId: 'wl',
    condition: { kind: 'attribute', attribute: 'sex', value: 'female' } as const,
    strength: 'hard' as const,
    enabled: true,
    effects: [{ kind: 'count', targetPositionId: 'male-vocals', minCount: 2 } as const],
  }

  const ruleState = (overrides: Partial<ServiceState> = {}) =>
    state({
      positions: [
        position({ id: 'wl', name: 'Worship Leader', minCount: 1 }),
        position({ id: 'male-vocals', name: 'Male Vocals', minCount: 1 }),
      ],
      rules: [VOCALS_RULE],
      ...overrides,
    })

  it('emits CONDITIONAL_MIN_UNFILLED with rule attribution when a fired rule is unmet', () => {
    const s = ruleState({
      assignments: [assign('sarah', 'wl'), assign('mike', 'male-vocals')],
      people: [
        person({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
        person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
      ],
    })
    const results = checkCoverage(s)
    const unmet = results.find((r) => r.code === 'CONDITIONAL_MIN_UNFILLED')
    expect(unmet).toBeDefined()
    expect(unmet!.severity).toBe('error')
    expect(unmet!.message).toContain('Male Vocals needs 2 when Worship Leader is female')
    expect(unmet!.message).toContain('Vocals balance')
  })

  it('a soft rule warns instead of erroring', () => {
    const s = ruleState({
      rules: [{ ...VOCALS_RULE, strength: 'soft' as const }],
      assignments: [assign('sarah', 'wl'), assign('mike', 'male-vocals')],
      people: [
        person({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
        person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
      ],
    })
    const unmet = checkCoverage(s).find((r) => r.code === 'CONDITIONAL_MIN_UNFILLED')
    expect(unmet!.severity).toBe('warning')
  })

  it('falls back to base minimums when the trigger is unfilled (dormant)', () => {
    const s = ruleState({
      assignments: [assign('mike', 'male-vocals')],
      people: [person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } })],
    })
    const results = checkCoverage(s)
    expect(results.find((r) => r.code === 'CONDITIONAL_MIN_UNFILLED')).toBeUndefined()
    // WL itself is understaffed (base min 1) — the plain code, not the rule one
    expect(results.find((r) => r.code === 'MANDATORY_UNFILLED')?.positionId).toBe('wl')
  })

  it('a manual plan override beats the fired rule', () => {
    const s = ruleState({
      assignments: [assign('sarah', 'wl'), assign('mike', 'male-vocals')],
      people: [
        person({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
        person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
      ],
      planMinOverrides: new Map([['male-vocals', 1]]),
    })
    expect(checkCoverage(s).find((r) => r.code === 'CONDITIONAL_MIN_UNFILLED')).toBeUndefined()
  })

  it('a muted rule does not fire', () => {
    const s = ruleState({
      assignments: [assign('sarah', 'wl'), assign('mike', 'male-vocals')],
      people: [
        person({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
        person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
      ],
      mutedRuleIds: new Set(['rule-a']),
    })
    expect(checkCoverage(s).find((r) => r.code === 'CONDITIONAL_MIN_UNFILLED')).toBeUndefined()
  })

  it('warns RULE_UNEVALUATED when the trigger assignee has no recorded sex', () => {
    const s = ruleState({
      assignments: [assign('sam', 'wl'), assign('mike', 'male-vocals')],
      people: [
        person({ id: 'sam', name: 'Sam', eligibility: { wl: 'qualified' } }),
        person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
      ],
    })
    const results = checkConditionalRules(s)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      code: 'RULE_UNEVALUATED',
      severity: 'warning',
      personIds: ['sam'],
    })
    expect(results[0].message).toContain('Vocals balance')
    expect(results[0].message).toContain("Sam's sex isn't recorded")
  })

  it('declined trigger assignees un-fire the rule', () => {
    const s = ruleState({
      assignments: [
        assign('sarah', 'wl', { status: 'declined' }),
        assign('mike', 'male-vocals'),
      ],
      people: [
        person({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
        person({ id: 'mike', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
      ],
    })
    expect(checkCoverage(s).find((r) => r.code === 'CONDITIONAL_MIN_UNFILLED')).toBeUndefined()
  })
})

describe('person-identity rules (issue #113 extension)', () => {
  // "When Sam leads, Sam plays guitar and Sharon plays keys."
  const SAM_RULE = {
    id: 'rule-sam',
    name: 'Sam leads & plays',
    serviceTypeId: null,
    triggerPositionId: 'wl',
    condition: { kind: 'person', personId: 'sam', personName: 'Sam Smith' } as const,
    strength: 'hard' as const,
    enabled: true,
    effects: [
      { kind: 'same-person', targetPositionId: 'guitar' } as const,
      { kind: 'person', targetPositionId: 'keys', personId: 'sharon', personName: 'Sharon Lee' } as const,
    ],
  }

  const samState = (overrides: Partial<ServiceState> = {}) =>
    state({
      positions: [
        position({ id: 'wl', name: 'Worship Leader', minCount: 1 }),
        position({ id: 'guitar', name: 'Guitar', minCount: 0 }),
        position({ id: 'keys', name: 'Keys', minCount: 0 }),
      ],
      rules: [SAM_RULE],
      ...overrides,
    })

  const sam = (over: Partial<ValidationPerson> = {}) =>
    person({ id: 'sam', name: 'Sam Smith', eligibility: { wl: 'qualified', guitar: 'qualified' }, ...over })
  const sharon = (over: Partial<ValidationPerson> = {}) =>
    person({ id: 'sharon', name: 'Sharon Lee', eligibility: { keys: 'qualified' }, ...over })

  it('flags missing required people at the rule strength, on the target position', () => {
    const s = samState({
      assignments: [assign('sam', 'wl')],
      people: [sam(), sharon()],
    })
    const results = checkPersonRequirements(s)
    expect(results).toHaveLength(2)
    const byPos = new Map(results.map((r) => [r.positionId, r]))
    expect(byPos.get('guitar')).toMatchObject({
      code: 'CONDITIONAL_PERSON_MISSING',
      severity: 'error',
      personIds: ['sam'],
    })
    expect(byPos.get('guitar')!.message).toContain(
      'Sam Smith is on Worship Leader and also needs to be on Guitar',
    )
    expect(byPos.get('keys')!.message).toContain('Keys needs Sharon Lee when Worship Leader is Sam Smith')
  })

  it('is satisfied once the required people hold the target positions', () => {
    const s = samState({
      assignments: [assign('sam', 'wl'), assign('sam', 'guitar'), assign('sharon', 'keys')],
      people: [sam(), sharon()],
    })
    expect(checkPersonRequirements(s)).toEqual([])
  })

  it('sanctions the rule-linked double-booking but still catches a third position', () => {
    const linked = samState({
      assignments: [assign('sam', 'wl'), assign('sam', 'guitar'), assign('sharon', 'keys')],
      people: [sam(), sharon()],
    })
    expect(checkMultiPosition(linked)).toEqual([])

    const overloaded = samState({
      positions: [
        position({ id: 'wl', name: 'Worship Leader', minCount: 1 }),
        position({ id: 'guitar', name: 'Guitar', minCount: 0 }),
        position({ id: 'keys', name: 'Keys', minCount: 0 }),
        position({ id: 'sound', name: 'Sound', minCount: 0 }),
      ],
      assignments: [assign('sam', 'wl'), assign('sam', 'guitar'), assign('sam', 'sound')],
      people: [sam({ eligibility: { wl: 'qualified', guitar: 'qualified', sound: 'qualified' } })],
    })
    const results = checkMultiPosition(overloaded)
    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('2 positions')
    expect(results[0].message).not.toContain('Guitar') // the sanctioned one
  })

  it('without the rule, the same double-booking is still an error', () => {
    const s = samState({
      rules: [],
      assignments: [assign('sam', 'wl'), assign('sam', 'guitar')],
      people: [sam()],
    })
    expect(checkMultiPosition(s)).toHaveLength(1)
  })

  it('notes a declined target and an unavailable required person', () => {
    const s = samState({
      assignments: [assign('sam', 'wl'), assign('sam', 'guitar', { status: 'declined' })],
      people: [
        sam(),
        sharon({ blockouts: [{ start: SUNDAY, end: SUNDAY }] }),
      ],
    })
    const results = checkPersonRequirements(s)
    const byPos = new Map(results.map((r) => [r.positionId, r]))
    expect(byPos.get('guitar')!.message).toContain('They declined that position.')
    expect(byPos.get('keys')!.message).toContain('Sharon Lee is unavailable that day')
  })

  it('a mirror (any → same person) rule demands the trigger assignee cross-team', () => {
    const mirror = {
      id: 'rule-mirror',
      name: 'Band runs foldback',
      serviceTypeId: null,
      triggerPositionId: 'wl',
      condition: { kind: 'any' } as const,
      strength: 'soft' as const,
      enabled: true,
      effects: [{ kind: 'same-person', targetPositionId: 'guitar' } as const],
    }
    const s = samState({
      rules: [mirror],
      assignments: [assign('tom', 'wl')],
      people: [person({ id: 'tom', name: 'Tom Jones', eligibility: { wl: 'qualified' } })],
    })
    const results = checkPersonRequirements(s)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ severity: 'warning', personIds: ['tom'] })
    expect(results[0].message).toContain('Tom Jones is on Worship Leader and also needs to be on Guitar')
  })
})
