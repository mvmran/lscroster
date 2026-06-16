import { useCallback, useState } from 'react'
import { useAuth } from '@/features/auth/use-auth'

// Personal team ordering for the Matrix "All service types" view (issue #33).
// Stored in localStorage, keyed by the logged-in user so it never leaks between
// accounts on a shared browser and never touches the church-wide data. A single
// service type uses the per-type order (serviceTypeTeamSort, #31) instead.

const KEY_PREFIX = 'lscroster.matrixTeamOrder.'

function storageKey(userId: string | undefined): string | null {
  return userId ? `${KEY_PREFIX}${userId}` : null
}

function readOrder(userId: string | undefined): string[] {
  const key = storageKey(userId)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * Sort `teams` by their index in the saved `order`. Any team not present in
 * `order` (e.g. a newly created team) is appended in its incoming order, so new
 * teams are never hidden by a stale saved order.
 */
export function applyTeamOrder<T extends { id: string }>(teams: T[], order: string[]): T[] {
  if (order.length === 0) return teams
  const rank = new Map(order.map((id, i) => [id, i]))
  const fallback = order.length
  return [...teams].sort(
    (a, b) => (rank.get(a.id) ?? fallback) - (rank.get(b.id) ?? fallback),
  )
}

/** The current login's saved Matrix team order, with a setter that persists. */
export function useMatrixTeamOrder() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [order, setOrder] = useState<string[]>(() => readOrder(userId))

  // Re-read when the logged-in user changes (e.g. sign out → sign in) without
  // MatrixPage unmounting. Reconciling during render is React's recommended
  // alternative to a setState-in-effect for "reset state when a prop changes".
  const [prevUserId, setPrevUserId] = useState(userId)
  if (userId !== prevUserId) {
    setPrevUserId(userId)
    setOrder(readOrder(userId))
  }

  const saveOrder = useCallback(
    (ids: string[]) => {
      setOrder(ids)
      const key = storageKey(userId)
      if (!key) return
      try {
        localStorage.setItem(key, JSON.stringify(ids))
      } catch {
        // Ignore quota / private-mode failures — order just won't persist.
      }
    },
    [userId],
  )

  return { order, saveOrder }
}
