import { describe, expect, it } from 'vitest'
import {
  autoSchedule,
  rankCandidates,
  type EngineCandidate,
  type EnginePosition,
  type EngineState,
} from './auto-scheduler'

const SUNDAY = '2026-07-05'
const SVC = 'svc-sunday'

function candidate(
  overrides: Partial<EngineCandidate> & { id: string; eligibility: EngineCandidate['eligibility'] },
): EngineCandidate {
  return {
    name: overrides.id,
    status: 'active',
    minGapDays: 0,
    maxPerMonth: null,
    targetPerMonth: null,
    maxConsecutive: null,
    blockouts: [],
    recurringUnavailability: [],
    history: [],
    ...overrides,
  }
}

function position(overrides: Partial<EnginePosition> & { id: string }): EnginePosition {
  return {
    name: overrides.id,
    teamId: 'team-1',
    teamName: 'Team 1',
    minCount: 1,
    maxCount: null,
    requiresLevel: null,
    fillPriority: 100,
    ...overrides,
  }
}

function state(overrides: Partial<EngineState> = {}): EngineState {
  return {
    service: { id: 'plan-1', date: SUNDAY, serviceTypeId: SVC },
    positions: [],
    candidates: [],
    existingAssignments: [],
    pairings: [],
    ...overrides,
  }
}

describe('autoSchedule', () => {
  it('fills an unfilled mandatory slot with an eligible person', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [candidate({ id: 'a', eligibility: { 'pos-1': 'qualified' } })],
      }),
    )
    expect(res.suggestions).toHaveLength(1)
    expect(res.suggestions[0]).toMatchObject({ personId: 'a', positionId: 'pos-1' })
    expect(res.unfilled).toHaveLength(0)
  })

  it('only fills up to min_count and respects existing assignments', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1', minCount: 2 })],
        candidates: [
          candidate({ id: 'a', eligibility: { 'pos-1': 'qualified' } }),
          candidate({ id: 'b', eligibility: { 'pos-1': 'qualified' } }),
        ],
        existingAssignments: [{ personId: 'a', positionId: 'pos-1', teamId: 'team-1' }],
      }),
    )
    // one slot already filled by 'a'; engine fills exactly one more with 'b'
    expect(res.suggestions).toHaveLength(1)
    expect(res.suggestions[0].personId).toBe('b')
  })

  it('skips positions with no mandatory minimum', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1', minCount: 0 })],
        candidates: [candidate({ id: 'a', eligibility: { 'pos-1': 'qualified' } })],
      }),
    )
    expect(res.suggestions).toHaveLength(0)
    expect(res.unfilled).toHaveLength(0)
  })

  it('never schedules an unavailable or inactive person', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [
          candidate({ id: 'a', eligibility: { 'pos-1': 'qualified' }, blockouts: [{ start: SUNDAY, end: SUNDAY }] }),
          candidate({ id: 'b', eligibility: { 'pos-1': 'qualified' }, status: 'break' }),
        ],
      }),
    )
    expect(res.suggestions).toHaveLength(0)
    expect(res.unfilled[0].reason).toMatch(/unavailable|break/)
  })

  it('reports an unfilled slot when nobody is set up', () => {
    const res = autoSchedule(state({ positions: [position({ id: 'pos-1', name: 'Drums' })] }))
    expect(res.suggestions).toHaveLength(0)
    expect(res.unfilled).toEqual([
      expect.objectContaining({ positionId: 'pos-1', reason: 'No one is set up for Drums' }),
    ])
  })

  it('never double-books a person across positions', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1' }), position({ id: 'pos-2' })],
        candidates: [candidate({ id: 'a', eligibility: { 'pos-1': 'qualified', 'pos-2': 'qualified' } })],
      }),
    )
    expect(res.suggestions).toHaveLength(1) // a fills one slot, the other is unfilled
    expect(res.unfilled).toHaveLength(1)
  })

  it('treats cadence as a hard constraint', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [
          candidate({
            id: 'a',
            eligibility: { 'pos-1': 'qualified' },
            minGapDays: 14,
            history: [{ date: '2026-06-28', serviceTypeId: SVC }],
          }),
        ],
      }),
    )
    expect(res.suggestions).toHaveLength(0)
    expect(res.unfilled[0].reason).toMatch(/limit/)
  })

  it('fills a required-level position with a qualified person over a trainee', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1', requiresLevel: 'qualified' })],
        candidates: [
          candidate({ id: 'trainee', eligibility: { 'pos-1': 'trainee' } }),
          candidate({ id: 'pro', eligibility: { 'pos-1': 'qualified' } }),
        ],
      }),
    )
    expect(res.suggestions).toHaveLength(1)
    expect(res.suggestions[0].personId).toBe('pro')
  })

  it('prefers the person who has served least recently', () => {
    const res = autoSchedule(
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [
          candidate({ id: 'recent', eligibility: { 'pos-1': 'qualified' }, history: [{ date: '2026-06-28', serviceTypeId: SVC }] }),
          candidate({ id: 'rusty', eligibility: { 'pos-1': 'qualified' }, history: [{ date: '2026-01-04', serviceTypeId: SVC }] }),
        ],
      }),
    )
    expect(res.suggestions[0].personId).toBe('rusty')
  })

  it('fills the scarcest position first', () => {
    // 'a' is the only person able to play Drums but could also fill Vocals;
    // scarcity ordering must spend 'a' on Drums, leaving Vocals for 'b'.
    const res = autoSchedule(
      state({
        positions: [
          position({ id: 'vocals', name: 'Vocals' }),
          position({ id: 'drums', name: 'Drums' }),
        ],
        candidates: [
          candidate({ id: 'a', eligibility: { drums: 'qualified', vocals: 'qualified' } }),
          candidate({ id: 'b', eligibility: { vocals: 'qualified' } }),
        ],
      }),
    )
    const byPos = Object.fromEntries(res.suggestions.map((s) => [s.positionId, s.personId]))
    expect(byPos).toEqual({ drums: 'a', vocals: 'b' })
    expect(res.unfilled).toHaveLength(0)
  })

  it('is deterministic — same inputs, same output', () => {
    const build = () =>
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [
          candidate({ id: 'a', eligibility: { 'pos-1': 'qualified' } }),
          candidate({ id: 'b', eligibility: { 'pos-1': 'qualified' } }),
        ],
      })
    expect(autoSchedule(build())).toEqual(autoSchedule(build()))
  })
})

describe('rankCandidates', () => {
  it('ranks the rule-passing substitutes, excluding the named person', () => {
    const ranked = rankCandidates(
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [
          candidate({ id: 'out', eligibility: { 'pos-1': 'qualified' } }),
          candidate({ id: 'recent', eligibility: { 'pos-1': 'qualified' }, history: [{ date: '2026-06-28', serviceTypeId: SVC }] }),
          candidate({ id: 'rusty', eligibility: { 'pos-1': 'qualified' }, history: [{ date: '2026-01-04', serviceTypeId: SVC }] }),
        ],
        existingAssignments: [{ personId: 'out', positionId: 'pos-1', teamId: 'team-1' }],
      }),
      'pos-1',
      { exclude: ['out'] },
    )
    expect(ranked.map((r) => r.personId)).toEqual(['rusty', 'recent'])
    expect(ranked[0]).toMatchObject({ level: 'qualified', monthCount: 0 })
  })

  it('omits unavailable / over-limit people from the substitutes', () => {
    const ranked = rankCandidates(
      state({
        positions: [position({ id: 'pos-1' })],
        candidates: [
          candidate({ id: 'free', eligibility: { 'pos-1': 'qualified' } }),
          candidate({ id: 'away', eligibility: { 'pos-1': 'qualified' }, blockouts: [{ start: SUNDAY, end: SUNDAY }] }),
        ],
      }),
      'pos-1',
    )
    expect(ranked.map((r) => r.personId)).toEqual(['free'])
  })

  it('restricts to qualified when replacing the only qualified in a required-level slot', () => {
    const ranked = rankCandidates(
      state({
        positions: [position({ id: 'pos-1', requiresLevel: 'qualified' })],
        candidates: [
          candidate({ id: 'pro', eligibility: { 'pos-1': 'qualified' } }),
          candidate({ id: 'sub', eligibility: { 'pos-1': 'qualified' } }),
          candidate({ id: 'trainee', eligibility: { 'pos-1': 'trainee' } }),
        ],
        existingAssignments: [{ personId: 'pro', positionId: 'pos-1', teamId: 'team-1' }],
      }),
      'pos-1',
      { exclude: ['pro'] },
    )
    // 'sub' qualifies; the trainee is filtered out because the slot now needs a qualified person
    expect(ranked.map((r) => r.personId)).toEqual(['sub'])
  })
})

describe('conditional rules in the engine (issue #113)', () => {
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

  const ruleState = (overrides: Partial<EngineState> = {}) =>
    state({
      positions: [
        position({ id: 'wl', name: 'Worship Leader', minCount: 1 }),
        position({ id: 'male-vocals', name: 'Male Vocals', minCount: 1 }),
      ],
      rules: [VOCALS_RULE],
      ...overrides,
    })

  it('re-expands the target after the trigger fires: 2 male vocals for a female WL', () => {
    const res = autoSchedule(
      ruleState({
        candidates: [
          candidate({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
          candidate({ id: 'm1', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
          candidate({ id: 'm2', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
        ],
      }),
    )
    expect(res.unfilled).toHaveLength(0)
    const vocals = res.suggestions.filter((s) => s.positionId === 'male-vocals')
    expect(vocals).toHaveLength(2)
    expect(res.suggestions.find((s) => s.positionId === 'wl')?.personId).toBe('sarah')
  })

  it('fires off pre-existing manual trigger assignments too', () => {
    const res = autoSchedule(
      ruleState({
        candidates: [
          candidate({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
          candidate({ id: 'm1', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
          candidate({ id: 'm2', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
        ],
        existingAssignments: [{ personId: 'sarah', positionId: 'wl', teamId: 'team-1' }],
      }),
    )
    expect(res.suggestions.filter((s) => s.positionId === 'male-vocals')).toHaveLength(2)
  })

  it('leaves the rule dormant when the trigger cannot be filled', () => {
    const res = autoSchedule(
      ruleState({
        candidates: [
          candidate({ id: 'm1', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
          candidate({ id: 'm2', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
        ],
      }),
    )
    // WL unfilled → rule never fires → male vocals fills only its base minimum
    expect(res.suggestions.filter((s) => s.positionId === 'male-vocals')).toHaveLength(1)
    expect(res.unfilled.map((u) => u.positionId)).toEqual(['wl'])
  })

  it('attributes a rule-raised unfilled slot to the rule', () => {
    const res = autoSchedule(
      ruleState({
        candidates: [
          candidate({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
          candidate({ id: 'm1', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
        ],
      }),
    )
    expect(res.unfilled).toHaveLength(1)
    expect(res.unfilled[0].positionId).toBe('male-vocals')
    expect(res.unfilled[0].reason).toContain('rule "Vocals balance"')
    expect(res.unfilled[0].reason).toContain('Worship Leader is female')
  })

  it('cascading rules resolve through the chain deterministically', () => {
    const chain = [
      {
        ...VOCALS_RULE,
        id: 'r1',
        name: 'r1',
        triggerPositionId: 'a',
        effects: [{ kind: 'count', targetPositionId: 'b', minCount: 1 } as const],
      },
      {
        ...VOCALS_RULE,
        id: 'r2',
        name: 'r2',
        triggerPositionId: 'b',
        effects: [{ kind: 'count', targetPositionId: 'c', minCount: 1 } as const],
      },
    ]
    const s = state({
      positions: [
        position({ id: 'a', minCount: 1 }),
        position({ id: 'b', minCount: 0 }),
        position({ id: 'c', minCount: 0 }),
      ],
      rules: chain,
      candidates: [
        candidate({ id: 'p1', sex: 'female', eligibility: { a: 'qualified' } }),
        candidate({ id: 'p2', sex: 'female', eligibility: { b: 'qualified' } }),
        candidate({ id: 'p3', sex: 'female', eligibility: { c: 'qualified' } }),
      ],
    })
    const first = autoSchedule(s)
    const second = autoSchedule(s)
    expect(first.suggestions.map((x) => `${x.personId}:${x.positionId}`)).toEqual([
      'p1:a',
      'p2:b',
      'p3:c',
    ])
    expect(second).toEqual(first)
  })

  it('plan min overrides beat fired rules in the engine too', () => {
    const res = autoSchedule(
      ruleState({
        candidates: [
          candidate({ id: 'sarah', sex: 'female', eligibility: { wl: 'qualified' } }),
          candidate({ id: 'm1', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
          candidate({ id: 'm2', sex: 'male', eligibility: { 'male-vocals': 'qualified' } }),
        ],
        planMinOverrides: new Map([['male-vocals', 1]]),
      }),
    )
    expect(res.suggestions.filter((s) => s.positionId === 'male-vocals')).toHaveLength(1)
    expect(res.unfilled).toHaveLength(0)
  })
})

describe('person-identity rules in the engine (issue #113 extension)', () => {
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

  const samState = (overrides: Partial<EngineState> = {}) =>
    state({
      positions: [
        position({ id: 'wl', name: 'Worship Leader', minCount: 1 }),
        position({ id: 'guitar', name: 'Guitar', minCount: 0 }),
        position({ id: 'keys', name: 'Keys', minCount: 0 }),
      ],
      rules: [SAM_RULE],
      ...overrides,
    })

  it('fills the package deal: Sam takes both positions, Sharon takes keys', () => {
    const res = autoSchedule(
      samState({
        existingAssignments: [{ personId: 'sam', positionId: 'wl', teamId: 'team-1' }],
        candidates: [
          candidate({ id: 'sam', name: 'Sam Smith', eligibility: { wl: 'qualified', guitar: 'qualified' } }),
          candidate({ id: 'sharon', name: 'Sharon Lee', eligibility: { keys: 'qualified' } }),
        ],
      }),
    )
    expect(res.unfilled).toHaveLength(0)
    const byPos = new Map(res.suggestions.map((s) => [s.positionId, s]))
    expect(byPos.get('guitar')).toMatchObject({ personId: 'sam', reason: 'Linked by rule "Sam leads & plays"' })
    expect(byPos.get('keys')).toMatchObject({ personId: 'sharon', reason: 'Named in rule "Sam leads & plays"' })
  })

  it('does not fire the package when someone else leads', () => {
    const res = autoSchedule(
      samState({
        existingAssignments: [{ personId: 'tom', positionId: 'wl', teamId: 'team-1' }],
        candidates: [
          candidate({ id: 'tom', eligibility: { wl: 'qualified' } }),
          candidate({ id: 'sam', eligibility: { wl: 'qualified', guitar: 'qualified' } }),
          candidate({ id: 'sharon', eligibility: { keys: 'qualified' } }),
        ],
      }),
    )
    expect(res.suggestions).toHaveLength(0)
    expect(res.unfilled).toHaveLength(0)
  })

  it('reports an unavailable required person by name instead of substituting', () => {
    const res = autoSchedule(
      samState({
        existingAssignments: [{ personId: 'sam', positionId: 'wl', teamId: 'team-1' }],
        candidates: [
          candidate({ id: 'sam', name: 'Sam Smith', eligibility: { wl: 'qualified', guitar: 'qualified' } }),
          candidate({
            id: 'sharon',
            name: 'Sharon Lee',
            eligibility: { keys: 'qualified' },
            blockouts: [{ start: SUNDAY, end: SUNDAY }],
          }),
          // Someone else could play keys — the rule wants Sharon, not a stand-in.
          candidate({ id: 'kim', eligibility: { keys: 'qualified' } }),
        ],
      }),
    )
    expect(res.suggestions.find((s) => s.positionId === 'keys')).toBeUndefined()
    const gap = res.unfilled.find((u) => u.positionId === 'keys')
    expect(gap?.reason).toContain('Rule "Sam leads & plays" needs Sharon Lee on Keys')
    expect(gap?.reason).toContain("they're unavailable that day")
  })

  it('mirror rule assigns the same person cross-team, exempt from double-booking', () => {
    const mirror = {
      ...SAM_RULE,
      id: 'rule-mirror',
      name: 'WL runs foldback',
      condition: { kind: 'any' } as const,
      effects: [{ kind: 'same-person', targetPositionId: 'foldback' } as const],
    }
    const res = autoSchedule(
      state({
        positions: [
          position({ id: 'wl', name: 'Worship Leader', minCount: 1, teamId: 'team-1' }),
          position({ id: 'foldback', name: 'Foldback', minCount: 0, teamId: 'team-2', teamName: 'Tech' }),
        ],
        rules: [mirror],
        candidates: [
          candidate({ id: 'tom', eligibility: { wl: 'qualified', foldback: 'qualified' } }),
        ],
      }),
    )
    expect(res.unfilled).toHaveLength(0)
    expect(res.suggestions.map((s) => `${s.personId}:${s.positionId}`).sort()).toEqual([
      'tom:foldback',
      'tom:wl',
    ])
  })

  it('a person requirement never double-fills the same slot', () => {
    // Requirement already satisfied — nothing to suggest.
    const res = autoSchedule(
      samState({
        existingAssignments: [
          { personId: 'sam', positionId: 'wl', teamId: 'team-1' },
          { personId: 'sam', positionId: 'guitar', teamId: 'team-1' },
          { personId: 'sharon', positionId: 'keys', teamId: 'team-1' },
        ],
        candidates: [
          candidate({ id: 'sam', eligibility: { wl: 'qualified', guitar: 'qualified' } }),
          candidate({ id: 'sharon', eligibility: { keys: 'qualified' } }),
        ],
      }),
    )
    expect(res.suggestions).toHaveLength(0)
    expect(res.unfilled).toHaveLength(0)
  })
})
