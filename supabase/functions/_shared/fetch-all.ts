// Paged reads past PostgREST's `max_rows` (1000), which truncates a response
// without saying so.

/**
 * Read every row, a page at a time. The query must have a stable order, or a
 * page boundary can skip or repeat rows. Throws on a query error rather than
 * returning nothing, so a failed read never passes for an empty one.
 *
 * Only an empty page ends it: a short one may just be a project whose
 * `max_rows` is below 1000, so the next page starts after the rows that came
 * back, not after the rows asked for. That costs one empty request at the end.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + size - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) return rows
    rows.push(...data)
  }
}
