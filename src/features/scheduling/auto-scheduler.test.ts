import { describe, expect, it } from 'vitest'
import {
  autoSchedule,
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
    teamExclusions: [],
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
