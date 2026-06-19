/**
 * Pick the plans to show in the Matrix window (issues #67 + #68): walk forward
 * from `startIndex`, skipping any collapsed (hidden) plans, until `count` plans
 * are collected or the list runs out. Collapsing a column therefore pulls the
 * next available plan in to keep the column count steady. Pure for testing.
 */
export function fillMatrixWindow<T extends { id: string }>(
  plans: T[],
  startIndex: number,
  count: number,
  collapsedIds: ReadonlySet<string>,
): T[] {
  const out: T[] = []
  const from = Math.max(0, startIndex)
  for (let i = from; i < plans.length && out.length < count; i++) {
    if (!collapsedIds.has(plans[i].id)) out.push(plans[i])
  }
  return out
}
