import { describe, expect, it } from 'vitest'
import { parseCollapseState } from '@/features/scheduling/use-matrix-collapse'

describe('parseCollapseState', () => {
  it('returns the empty state for null / empty input', () => {
    expect(parseCollapseState(null)).toEqual({ teams: [], order: false })
    expect(parseCollapseState('')).toEqual({ teams: [], order: false })
  })

  it('returns the empty state for corrupt JSON', () => {
    expect(parseCollapseState('{not json')).toEqual({ teams: [], order: false })
  })

  it('parses a well-formed blob', () => {
    expect(parseCollapseState('{"teams":["a","b"],"order":true}')).toEqual({
      teams: ['a', 'b'],
      order: true,
    })
  })

  it('drops non-string team ids and defaults a missing order flag', () => {
    expect(parseCollapseState('{"teams":["a",1,null,"b"]}')).toEqual({
      teams: ['a', 'b'],
      order: false,
    })
  })

  it('ignores non-array teams and non-boolean order', () => {
    expect(parseCollapseState('{"teams":"a","order":"yes"}')).toEqual({
      teams: [],
      order: false,
    })
  })
})
