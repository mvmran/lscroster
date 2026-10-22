// Paged reads past PostgREST's `max_rows` (1000), which truncates a response
// without saying so.

/**
 * Read every row, a page at a time. The query must have a stable order, or a
 * page boundary can skip or repeat rows. Throws on a query error rather than
 * returning nothing, so a failed read never passes for an empty one.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < size) return rows
  }
}
