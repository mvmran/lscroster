/** Select options for counting rows without fetching them. */
export const COUNT_ONLY = { count: 'exact', head: true } as const

/**
 * How many rows a filtered query matches — for the "this goes with it" lists
 * in delete warnings. Pass a query built with `select(…, COUNT_ONLY)`.
 */
export async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}
