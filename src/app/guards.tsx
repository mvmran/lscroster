import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageError } from '@/components/full-page-error'
import { FullPageLoader } from '@/components/full-page-loader'
import { useAuth } from '@/features/auth/use-auth'
import { useChurchSettings } from '@/features/settings/use-church-settings'

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
