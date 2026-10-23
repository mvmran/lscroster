import { describe, expect, it } from 'vitest'
import { fetchAll } from './fetch-all'

// A table of `total` rows served the way PostgREST does: `range` inclusive,
// never more than `maxRows` at once.
function table(total: number, maxRows = 1000) {
  const ranges: [number, number][] = []
  const page = async (from: number, to: number) => {
    ranges.push([from, to])
    const end = Math.min(to + 1, from + maxRows, total)
    return { data: Array.from({ length: Math.max(end - from, 0) }, (_, i) => from + i), error: null }
  }
  return { page, ranges }
}

describe('fetchAll', () => {
  it('reads a short table, then confirms with an empty page', async () => {
    const { page, ranges } = table(3)
    expect(await fetchAll(page)).toEqual([0, 1, 2])
    expect(ranges).toEqual([[0, 999], [3, 1002]])
  })

  it('pages past 1000 rows', async () => {
    const { page, ranges } = table(2500)
    const rows = await fetchAll(page)
    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toBe(2499)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]])
  })

  it('reads everything when the server caps pages below 1000', async () => {
    const { page, ranges } = table(1200, 500)
    const rows = await fetchAll(page)
    expect(rows).toEqual(Array.from({ length: 1200 }, (_, i) => i))
    expect(ranges.map(([from]) => from)).toEqual([0, 500, 1000, 1200])
  })

  it('returns nothing for an empty table', async () => {
    expect(await fetchAll(table(0).page)).toEqual([])
  })

  it('throws on a query error instead of returning what it had', async () => {
    let calls = 0
    const page = async () =>
      ++calls === 1
        ? { data: Array.from({ length: 1000 }, () => 1), error: null }
        : { data: null, error: { message: 'boom' } }
    await expect(fetchAll(page)).rejects.toThrow('boom')
  })

  it('stops a page function that ignores the range', async () => {
    let calls = 0
    const page = async () => {
      calls++
      return { data: [1, 2, 3], error: null }
    }
    await expect(fetchAll(page)).rejects.toThrow('does the query apply .range')
    expect(calls).toBe(100)
  })
})
