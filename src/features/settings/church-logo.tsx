import type { ReactNode } from 'react'
import { logoPublicUrl } from '@/features/settings/use-church-logo'
import { cn } from '@/lib/utils'

interface LogoSettings {
  logo_url: string | null
  logo_dark_url: string | null
}

/**
 * Render the church logo, picking the light or dark variant by theme. When only
 * one variant is set it's used for both (issue #58). Renders `fallback` (e.g. an
 * icon) when no logo is configured at all.
 */
export function ChurchLogo({
  settings,
  className,
  fallback = null,
}: {
  settings: LogoSettings | null | undefined
  className?: string
  fallback?: ReactNode
}) {
  const light = logoPublicUrl(settings?.logo_url ?? settings?.logo_dark_url)
  const dark = logoPublicUrl(settings?.logo_dark_url ?? settings?.logo_url)
  if (!light && !dark) return <>{fallback}</>
  return (
    <>
      {light && (
        <img src={light} alt="" className={cn('object-contain dark:hidden', className)} />
      )}
      {dark && (
        <img src={dark} alt="" className={cn('hidden object-contain dark:block', className)} />
      )}
    </>
  )
}
