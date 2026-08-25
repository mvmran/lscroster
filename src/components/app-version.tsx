import { format } from 'date-fns'
import { APP_NAME, APP_VERSION, BUILD_COMMIT, BUILD_DATE } from '@/lib/version'

/**
 * Quiet build stamp for the bottom of the Settings page. Every user sees it,
 * so the support question — "which build are you on?" — is answered by one
 * screenshot, on any instance.
 */
export function AppVersion() {
  const built = new Date(BUILD_DATE)
  const builtLabel = Number.isNaN(built.getTime()) ? null : format(built, 'd MMM yyyy')

  return (
    <footer className="pt-2 pb-4 text-center">
      <p className="text-muted-foreground/70 text-xs">
        {APP_NAME} v{APP_VERSION} &middot; build {BUILD_COMMIT}
        {builtLabel && <> &middot; {builtLabel}</>}
      </p>
      <p className="text-muted-foreground/60 mt-0.5 text-[0.6875rem]">
        Distributed under GNU GPLv3. Copyright (c) 2026 Manoj Mathew
      </p>
    </footer>
  )
}
