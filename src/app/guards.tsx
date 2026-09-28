import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageError } from '@/components/full-page-error'
import { FullPageLoader } from '@/components/full-page-loader'
import { useAuth } from '@/features/auth/use-auth'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { holdsAllPermissions, holdsPermission } from '@/features/auth/permissions'
import { usePersonPermissions } from '@/features/auth/use-permissions'
import { useMyLedTeams } from '@/features/scheduling/use-team-access'
import { useChurchSettings } from '@/features/settings/use-church-settings'

const NO_GRANTS = new Set<never>()

/**
 * Wraps all app routes: waits for the session + church settings, sends new
 * instances to the setup wizard, and unauthenticated visitors to sign-in.
 */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const settings = useChurchSettings()
  const location = useLocation()

  if (loading || settings.isPending) return <FullPageLoader />
  if (settings.isError) return <FullPageError message={settings.error.message} />
  if (settings.data === null) return <Navigate to="/setup" replace />
  if (!session) {
    return <Navigate to="/signin" state={{ from: location }} replace />
  }
  return <Outlet />
}

/** Admin-only routes (the UI side; RLS enforces the same at the API). */
export function RequireAdmin() {
  const me = useCurrentPerson()

  if (me.isPending) return <FullPageLoader />
  if (me.data?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

/** Admin- or coordinator-only routes, e.g. service types (issue #125). */
export function RequireAdminOrCoordinator() {
  const me = useCurrentPerson()

  if (me.isPending) return <FullPageLoader />
  if (me.data?.role !== 'admin' && me.data?.role !== 'coordinator') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

/**
 * The Matrix is a rostering surface. It's open to whoever can roster: admins
 * and coordinators (who hold every permission), any member granted
 * `edit_order_of_service`, and any Team Leader — mirroring `canMatrix` on the
 * Services page. Everyone else is sent home rather than shown an empty grid.
 * RLS scopes the data regardless; this just keeps the page off-limits by URL.
 */
export function RequireMatrixAccess() {
  const me = useCurrentPerson()
  const all = holdsAllPermissions(me.data?.role)
  const granted = usePersonPermissions(me.data && !all ? me.data.id : undefined)
  const led = useMyLedTeams()

  if (me.isPending) return <FullPageLoader />
  if (!me.data) return <Navigate to="/" replace />
  if (all) return <Outlet />
  if (granted.isPending || led.isPending) return <FullPageLoader />

  const canMatrix =
    holdsPermission(me.data.role, granted.data ?? NO_GRANTS, 'edit_order_of_service') ||
    (led.data?.size ?? 0) > 0
  return canMatrix ? <Outlet /> : <Navigate to="/" replace />
}
