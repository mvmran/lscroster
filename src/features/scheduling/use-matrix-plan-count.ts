import { useCallback, useState } from 'react'
import { useAuth } from '@/features/auth/use-auth'

// How many upcoming services the Matrix shows side by side (issue #57). Stored
// in localStorage per login, like the personal team order (use-matrix-team-order).

const KEY_PREFIX = 'lscroster.matrixPlanCount.'

export const MATRIX_PLAN_COUNT_DEFAULT = 4
export const MATRIX_PLAN_COUNT_MIN = 2
export const MATRIX_PLAN_COUNT_MAX = 9

export function clampPlanCount(n: number): number {
  if (!Number.isFinite(n)) return MATRIX_PLAN_COUNT_DEFAULT
  return Math.min(MATRIX_PLAN_COUNT_MAX, Math.max(MATRIX_PLAN_COUNT_MIN, Math.round(n)))
}

function storageKey(userId: string | undefined): string | null {
  return userId ? `${KEY_PREFIX}${userId}` : null
}

function readCount(userId: string | undefined): number {
  const key = storageKey(userId)
  if (!key) return MATRIX_PLAN_COUNT_DEFAULT
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return MATRIX_PLAN_COUNT_DEFAULT
    return clampPlanCount(Number(raw))
  } catch {
    return MATRIX_PLAN_COUNT_DEFAULT
  }
}

/** The current login's saved Matrix service count, with a persisting setter. */
export function useMatrixPlanCount() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [count, setCountState] = useState<number>(() => readCount(userId))

  // Re-read when the logged-in user changes without MatrixPage remounting —
  // render-phase reconcile, React's alternative to a setState-in-effect.
  const [prevUserId, setPrevUserId] = useState(userId)
  if (userId !== prevUserId) {
    setPrevUserId(userId)
    setCountState(readCount(userId))
  }

  const setCount = useCallback(
    (next: number) => {
      const clamped = clampPlanCount(next)
      setCountState(clamped)
      const key = storageKey(userId)
      if (!key) return
      try {
        localStorage.setItem(key, String(clamped))
      } catch {
        // Ignore quota / private-mode failures — it just won't persist.
      }
    },
    [userId],
  )

  return { count, setCount }
}
