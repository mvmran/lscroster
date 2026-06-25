import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/use-auth'

// Persist which Matrix sections are collapsed (hidden) — the per-team position
// rows and the ORDER section (issue #112). Stored in localStorage per login on
// this browser, like the column count (use-matrix-plan-count) and the personal
// team order (use-matrix-team-order), so it never leaks between accounts on a
// shared browser. Plan-column hiding is deliberately left transient: it's
// date-specific and resets as services pass.

const KEY_PREFIX = 'lscroster.matrixCollapse.'

export type MatrixCollapseState = { teams: string[]; order: boolean }

const EMPTY: MatrixCollapseState = { teams: [], order: false }

/** Parse a stored collapse blob, tolerating absent/corrupt/legacy values. */
export function parseCollapseState(raw: string | null): MatrixCollapseState {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY
    const obj = parsed as Record<string, unknown>
    const teams = Array.isArray(obj.teams)
      ? obj.teams.filter((v): v is string => typeof v === 'string')
      : []
    const order = typeof obj.order === 'boolean' ? obj.order : false
    return { teams, order }
  } catch {
    return EMPTY
  }
}

function storageKey(userId: string | undefined): string | null {
  return userId ? `${KEY_PREFIX}${userId}` : null
}

function readState(userId: string | undefined): MatrixCollapseState {
  const key = storageKey(userId)
  if (!key) return EMPTY
  try {
    return parseCollapseState(localStorage.getItem(key))
  } catch {
    return EMPTY
  }
}

/**
 * The current login's collapsed Matrix teams + ORDER section, with toggles that
 * persist to localStorage.
 */
export function useMatrixCollapse() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [state, setState] = useState<MatrixCollapseState>(() => readState(userId))

  // Re-read when the logged-in user changes without MatrixPage remounting —
  // render-phase reconcile, React's alternative to a setState-in-effect.
  const [prevUserId, setPrevUserId] = useState(userId)
  if (userId !== prevUserId) {
    setPrevUserId(userId)
    setState(readState(userId))
  }

  // Functional update so two toggles fired before a re-render don't clobber each
  // other via a stale closure; localStorage is written with the computed next
  // value so storage always matches state.
  const update = useCallback(
    (fn: (prev: MatrixCollapseState) => MatrixCollapseState) => {
      setState((prev) => {
        const next = fn(prev)
        const key = storageKey(userId)
        if (key) {
          try {
            localStorage.setItem(key, JSON.stringify(next))
          } catch {
            // Ignore quota / private-mode failures — it just won't persist.
          }
        }
        return next
      })
    },
    [userId],
  )

  const collapsedTeamIds = useMemo(() => new Set(state.teams), [state.teams])

  const toggleTeamCollapse = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        teams: prev.teams.includes(id)
          ? prev.teams.filter((t) => t !== id)
          : [...prev.teams, id],
      })),
    [update],
  )

  const toggleOrderCollapsed = useCallback(
    () => update((prev) => ({ ...prev, order: !prev.order })),
    [update],
  )

  return {
    collapsedTeamIds,
    toggleTeamCollapse,
    orderCollapsed: state.order,
    toggleOrderCollapsed,
  }
}
