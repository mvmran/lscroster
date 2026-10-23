import { describe, expect, it } from 'vitest'
import { fetchAll } from './fetch-all'

// A table of `total` rows served the way PostgREST does: `range` inclusive,
// never more than 1000 at once.
function table(total: number) {
  const ranges: [number, number][] = []
  const page = async (from: number, to: number) => {
    ranges.push([from, to])
    const end = Math.min(to + 1, from + 1000, total)
    return { data: Array.from({ length: Math.max(end - from, 0) }, (_, i) => from + i), error: null }
  }
  return { page, ranges }
}

describe('fetchAll', () => {
  it('reads a short table in one request', async () => {
    const { page, ranges } = table(3)
    expect(await fetchAll(page)).toEqual([0, 1, 2])
    expect(ranges).toEqual([[0, 999]])
  })

  it('pages past 1000 rows', async () => {
    const { page, ranges } = table(2500)
    const rows = await fetchAll(page)
    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toBe(2499)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('asks once more when the last page is exactly full', async () => {
    const { page, ranges } = table(1000)
    expect(await fetchAll(page)).toHaveLength(1000)
    expect(ranges).toHaveLength(2)
  })

  it('throws on a query error instead of returning what it had', async () => {
    let calls = 0
    const page = async () =>
      ++calls === 1
        ? { data: Array.from({ length: 1000 }, () => 1), error: null }
        : { data: null, error: { message: 'boom' } }
    await expect(fetchAll(page)).rejects.toThrow('boom')
  })
})
